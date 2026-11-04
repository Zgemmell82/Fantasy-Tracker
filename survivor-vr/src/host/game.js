// Round-loop state machine. Authoritative; lives on the host page.
//
// phases: lobby -> turnReady -> countdown -> running -> turnResult -> (next player ...)
//         -> roundResults -> voting -> readout -> roundEnd -> lobby (next round)
import { GAME } from '../config/game.js';
import { rankResults, formatValue } from '../config/scoring.js';
import { drawEffect } from '../config/effects.js';
import { shuffle, countSentences, uid } from '../shared/util.js';

export class Game {
  /** runner: { prepare(info), start(), stop(), applyEffect(effect) } - implemented by main.js */
  constructor(runner) {
    this.runner = runner;
    this.onChange = () => {};
    this.players = [];            // {id,name,color,bot,eliminated}
    this.phase = 'lobby';
    this.round = 0;
    this.challengeId = null;
    this.order = [];
    this.turnIndex = -1;
    this.headsetId = null;
    this.results = {};
    this.ranking = [];
    this.immunityId = null;
    this.taps = {};
    this.feed = [];
    this.votes = {};              // pid -> {target, message}
    this.readout = null;
    this.tally = null;
    this.votedOut = [];
    this.countdown = 0;
    this.timer = 0;               // generic phase timer (result / readout auto-advance)
    this.notice = '';
    this._feedId = 0;
    this.version = 0;
  }

  // ---------- helpers ----------
  get active() { return this.players.filter((p) => !p.eliminated); }
  player(id) { return this.players.find((p) => p.id === id); }
  changed() { this.version++; this.onChange(); }
  pushFeed(kind, text) {
    this.feed.push({ id: ++this._feedId, kind, text });
    if (this.feed.length > GAME.feedLength) this.feed.shift();
    this.changed();
  }

  // ---------- lobby ----------
  join(id, name, { bot = false } = {}) {
    const ex = this.player(id);
    if (ex) { if (name) ex.name = String(name).slice(0, 14); this.changed(); return { ok: true }; }
    if (this.phase !== 'lobby' && this.phase !== 'roundEnd') return { ok: false, reason: 'A round is in progress - join between rounds.' };
    if (this.players.length >= GAME.maxPlayers) return { ok: false, reason: `Tribe is full (${GAME.maxPlayers}).` };
    const color = GAME.playerColors.find((c) => !this.players.some((p) => p.color === c)) || '#ccc';
    this.players.push({ id, name: String(name || 'Castaway').slice(0, 14), color, bot, eliminated: false });
    this.changed();
    return { ok: true };
  }

  addBot() {
    const used = new Set(this.players.map((p) => p.name));
    const name = GAME.botNames.find((n) => !used.has(n)) || 'Bot' + uid().slice(0, 2);
    return this.join('bot_' + uid(), name, { bot: true });
  }

  removePlayer(id) {
    if (this.phase !== 'lobby' && this.phase !== 'roundEnd') return;
    this.players = this.players.filter((p) => p.id !== id);
    this.changed();
  }

  canStart() {
    const n = this.active.length;
    return (this.phase === 'lobby' || this.phase === 'roundEnd') && n >= GAME.minPlayers && n <= GAME.maxPlayers;
  }

  // ---------- round ----------
  startRound(challengeId) {
    if (!this.canStart()) return { ok: false, reason: `Need ${GAME.minPlayers}-${GAME.maxPlayers} players` };
    this.round++;
    this.challengeId = challengeId;
    const ids = this.active.map((p) => p.id);
    this.order = GAME.shuffleTurnOrder ? shuffle(ids) : ids;
    this.turnIndex = -1;
    this.results = {};
    this.ranking = [];
    this.immunityId = null;
    this.votes = {};
    this.readout = null;
    this.tally = null;
    this.votedOut = [];
    this.nextTurn();
    return { ok: true };
  }

  nextTurn() {
    this.turnIndex++;
    if (this.turnIndex >= this.order.length) return this.finishRound();
    this.headsetId = this.order[this.turnIndex];
    this.taps = {};
    this.feed = [];
    this.phase = 'turnReady';
    this.runner.prepare({ challengeId: this.challengeId, playerId: this.headsetId, turnIndex: this.turnIndex, round: this.round });
    this.changed();
  }

  /** headset player (or host) says go */
  beginTurn() {
    if (this.phase !== 'turnReady') return;
    this.phase = 'countdown';
    this.countdown = GAME.turn.countdownSeconds;
    this.changed();
  }

  update(dt) {
    if (this.phase === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = 'running';
        this.runner.start();
        this.changed();
      } else if (Math.ceil(this.countdown) !== before) this.changed();
    } else if (this.phase === 'turnResult' && GAME.turn.autoAdvance) {
      this.timer -= dt;
      if (this.timer <= 0) this.nextTurn();
    } else if (this.phase === 'readout' && GAME.vote.autoAdvanceReadout) {
      this.timer -= dt;
      if (this.timer <= 0) this.nextReadout();
    } else if (this.phase === 'voting' && this._allIn && (this._allInTimer -= dt) <= 0) {
      this.startReadout();
    }
  }

  /** called by the runner when the headset run ends */
  finishTurn(result) {
    if (this.phase !== 'running' && this.phase !== 'countdown') return;
    this.runner.stop();
    const r = { ...result };
    r.display = formatValue(this.challengeId, r);
    this.results[this.headsetId] = r;
    this.phase = 'turnResult';
    this.timer = GAME.turn.resultSeconds;
    this.changed();
  }

  skipTurnResult() { if (this.phase === 'turnResult') this.nextTurn(); }

  finishRound() {
    this.headsetId = null;
    this.ranking = rankResults(this.challengeId, this.results, this.order);
    this.immunityId = this.ranking[0] || null;
    this.phase = 'roundResults';
    this.changed();
  }

  // ---------- taps ----------
  tap(pid, kind) {
    if (this.phase !== 'running') return { ok: false, reason: 'Taps open once the run starts.' };
    if (!this.player(pid) || pid === this.headsetId) return { ok: false, reason: 'You are in the headset!' };
    if (kind !== 'help' && kind !== 'sabotage') return { ok: false, reason: 'bad tap' };
    if (this.taps[pid]) return { ok: false, reason: 'Already tapped this run.' };
    this.taps[pid] = kind;
    const effect = drawEffect(this.challengeId, kind);
    this.runner.applyEffect(effect, kind);
    this.pushFeed(kind, effect.feed);
    return { ok: true, effect };
  }

  tapsLeft() {
    return this.order.length ? this.order.filter((id) => id !== this.headsetId && !this.taps[id]).length : 0;
  }

  // ---------- tribal ----------
  startVoting() {
    if (this.phase !== 'roundResults') return;
    this.phase = 'voting';
    this.votes = {};
    this._allIn = false;
    this.changed();
  }

  votableTargets(forPid) {
    return this.active.filter((p) =>
      (GAME.vote.allowSelfVote || p.id !== forPid) &&
      (GAME.vote.immunityWinnerCanBeVoted || p.id !== this.immunityId));
  }

  submitVote(pid, target, message) {
    if (this.phase !== 'voting') return { ok: false, reason: 'Voting is not open.' };
    const voter = this.player(pid);
    if (!voter || voter.eliminated) return { ok: false, reason: 'You cannot vote.' };
    if (this.votes[pid]) return { ok: false, reason: 'Your vote is already in.' };
    if (!this.votableTargets(pid).some((p) => p.id === target)) return { ok: false, reason: 'You cannot vote for that player (immunity!).' };
    const msg = String(message || '').trim();
    if (msg.length < GAME.vote.minChars) return { ok: false, reason: 'Say a little more.' };
    if (msg.length > GAME.vote.maxChars) return { ok: false, reason: `Max ${GAME.vote.maxChars} characters.` };
    if (countSentences(msg) > GAME.vote.maxSentences) return { ok: false, reason: `Max ${GAME.vote.maxSentences} sentences.` };
    this.votes[pid] = { target, message: msg };
    if (this.active.every((p) => this.votes[p.id])) { this._allIn = true; this._allInTimer = 1.5; }
    this.changed();
    return { ok: true };
  }

  startReadout() {
    if (this.phase !== 'voting') return;
    const entries = shuffle(Object.values(this.votes));   // order is shuffled: no clues about voter
    this.readout = { index: 0, entries };
    if (!entries.length) return this.endTribal();
    this.phase = 'readout';
    this.timer = GAME.vote.readoutSeconds;
    this.changed();
  }

  nextReadout() {
    if (this.phase !== 'readout') return;
    this.readout.index++;
    if (this.readout.index >= this.readout.entries.length) return this.endTribal();
    this.timer = GAME.vote.readoutSeconds;
    this.changed();
  }

  endTribal() {
    const counts = {};
    for (const v of Object.values(this.votes)) counts[v.target] = (counts[v.target] || 0) + 1;
    const max = Math.max(0, ...Object.values(counts));
    const top = Object.keys(counts).filter((id) => counts[id] === max);
    this.tally = counts;
    this.votedOut = max > 0 && top.length === 1 ? top : [];   // tie = nobody goes home
    if (GAME.eliminateVotedOut) for (const id of this.votedOut) { const p = this.player(id); if (p) p.eliminated = true; }
    this.phase = 'roundEnd';
    this.changed();
  }

  /** ready for a new challenge pick */
  nextRound() { if (this.phase === 'roundEnd') { this.phase = 'lobby'; this.changed(); } }

  // ---------- what phones and the TV get ----------
  publicState() {
    const ro = this.readout;
    let readout = null;
    if (ro && this.phase === 'readout') {
      const counts = {};
      for (let i = 0; i <= ro.index; i++) counts[ro.entries[i].target] = (counts[ro.entries[i].target] || 0) + 1;
      const cur = ro.entries[ro.index];
      readout = { index: ro.index, total: ro.entries.length, current: { target: cur.target, message: cur.message }, counts };
    }
    return {
      v: this.version,
      phase: this.phase,
      round: this.round,
      challengeId: this.challengeId,
      players: this.players.map((p) => ({ id: p.id, name: p.name, color: p.color, bot: p.bot, eliminated: p.eliminated })),
      order: this.order,
      headsetId: this.headsetId,
      turnIndex: this.turnIndex,
      countdown: Math.max(0, Math.ceil(this.countdown)),
      taps: this.taps,                       // phones only read their own entry; TV only shows a count
      tapCount: Object.keys(this.taps).length,
      tapsLeft: this.tapsLeft(),
      results: this.results,
      ranking: this.ranking,
      immunityId: this.immunityId,
      voted: Object.keys(this.votes),        // who has voted (never what)
      readout,
      tally: this.phase === 'roundEnd' ? this.tally : null,
      votedOut: this.phase === 'roundEnd' ? this.votedOut : [],
      feed: this.feed,
      notice: this.notice,
    };
  }
}
