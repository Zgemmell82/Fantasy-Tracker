// Whole-game state machine. Authoritative; lives on the host page.
//
//  lobby -> tribes (2-tribe games) -> picker -> [episode] -> roundResults -> tribal -> (merge) -> picker ...
//  episode  = a queue of headset runs:
//     team       : relay challenge, one tribe at a time (clock keeps running between teammates)
//     individual : one challenge, every active player, best = immunity
//  tribal   = voting -> readout -> (tie -> revote -> readout -> tie -> unanimous -> draw) -> tribalResult
//  finale   = finaleIntro -> 4 individual challenges (finaleScores each) -> finaleImmunity
//             -> fire-making for the other two -> fireResult -> pitch -> jury -> juryReveal -> winner
import { GAME } from '../config/game.js';
import { rankResults, rankWithTies, placementPoints, formatValue } from '../config/scoring.js';
import { drawEffect } from '../config/effects.js';
import { CHALLENGE_META } from '../config/meta.js';
import { shuffle, countSentences, uid } from '../shared/util.js';

export const RUN_PHASES = ['turnReady', 'countdown', 'running', 'handoff', 'turnResult'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class Game {
  /** runner: { prepare(info), start(), stop(), applyEffect(effect, kind) } - implemented by main.js */
  constructor(runner) {
    this.runner = runner;
    this.onChange = () => {};
    this.code = '----';
    this.players = [];            // {id,name,color,bot,tribe:'A'|'B'|null,oldTribe,status:'active'|'juror'|'out'}
    this._feedId = 0;
    this.version = 0;
    this.resetGame();
  }

  resetGame() {
    this.phase = 'lobby';
    this.started = false; this.twoTribes = false; this.merged = false;
    this.episode = 0; this.episodeType = null; this.challengeId = null;
    this.queue = []; this.queueKind = null; this.runIndex = -1; this.run = null;
    this.results = []; this.lastResult = null; this.groupTotals = {};
    this.headsetId = null; this.taps = {}; this.feed = [];
    this.relayClock = 0; this.relayPenalty = 0; this.handoff = 0;
    this.countdown = 0; this.timer = 0;
    this.ranking = []; this.immunityId = null; this.team = null;
    this.tribal = null; this.finale = null; this.jury = null; this.winnerId = null;
    this.jurors = [];
    this.notice = '';
    for (const p of this.players) { p.status = 'active'; p.tribe = null; p.oldTribe = null; }
  }

  // ---------- helpers ----------
  get active() { return this.players.filter((p) => p.status === 'active'); }
  player(id) { return this.players.find((p) => p.id === id); }
  name(id) { return this.player(id)?.name || '?'; }
  members(tid) { return this.active.filter((p) => p.tribe === tid).map((p) => p.id); }
  changed() { this.version++; this.onChange(); }
  pushFeed(kind, text) {
    this.feed.push({ id: ++this._feedId, kind, text });
    if (this.feed.length > GAME.feedLength) this.feed.shift();
    this.changed();
  }
  relayTotal() { return this.relayClock + this.relayPenalty; }

  // ---------- lobby ----------
  join(id, name, { bot = false } = {}) {
    const ex = this.player(id);
    if (ex) { if (name) ex.name = String(name).slice(0, 14); this.changed(); return { ok: true }; }
    if (this.phase !== 'lobby') return { ok: false, reason: 'The game already started.' };
    if (this.players.length >= GAME.maxPlayers) return { ok: false, reason: `Tribe is full (${GAME.maxPlayers}).` };
    const color = GAME.playerColors.find((c) => !this.players.some((p) => p.color === c)) || '#ccc';
    this.players.push({ id, name: String(name || 'Castaway').slice(0, 14), color, bot, tribe: null, oldTribe: null, status: 'active' });
    this.changed();
    return { ok: true };
  }

  addBot() {
    const used = new Set(this.players.map((p) => p.name));
    const name = GAME.botNames.find((n) => !used.has(n)) || 'Bot' + uid().slice(0, 2);
    return this.join('bot_' + uid(), name, { bot: true });
  }

  removePlayer(id) {
    if (this.phase !== 'lobby') return;
    this.players = this.players.filter((p) => p.id !== id);
    this.changed();
  }

  canStart() { return this.phase === 'lobby' && this.players.length >= GAME.minPlayers && this.players.length <= GAME.maxPlayers; }

  startGame() {
    if (!this.canStart()) return { ok: false, reason: `Need ${GAME.minPlayers}-${GAME.maxPlayers} players` };
    const n = this.players.length;
    this.started = true;
    this.twoTribes = n >= GAME.twoTribeMinPlayers;
    this.merged = !this.twoTribes;
    if (this.twoTribes) {
      const sh = shuffle(this.players), k = Math.ceil(n / 2);     // 11 players -> 6 + 5
      sh.forEach((p, i) => { p.tribe = i < k ? GAME.tribes[0].id : GAME.tribes[1].id; });
    }
    if (n <= GAME.finaleAt) { this.startFinale(); return { ok: true }; }
    this.phase = this.twoTribes ? 'tribes' : 'picker';
    this.changed();
    return { ok: true };
  }

  /** the host's "Continue" button - does the sensible next thing for the current phase */
  next() {
    switch (this.phase) {
      case 'tribes': this.phase = 'picker'; this.changed(); break;
      case 'roundResults': this.startTribal(); break;
      case 'tie': this.continueTie(); break;
      case 'tribalResult': this.afterTribal(); break;
      case 'merge': this.afterMerge(); break;
      case 'turnResult': this.advanceFromResult(); break;
      case 'turnReady': case 'handoff': this.beginTurn(); break;
      case 'finaleIntro': this.startFinaleRuns(); break;
      case 'finaleScores': if (this.finale.finalScores) this.finishFinaleChallenges(); else this.nextRun(); break;
      case 'finaleImmunity': this.startFire(); break;
      case 'fireResult': this.startPitches(); break;
      case 'pitch': this.nextPitch(); break;
      case 'voting': this.startReadout(); break;
      case 'readout': this.nextReadout(); break;
      case 'unanimous': this.forceDeadlock(); break;
      case 'draw': this.finishDraw(); break;
      case 'jury': this.startJuryReveal(); break;
      case 'juryReveal': this.nextJuryReveal(); break;
    }
  }

  // ---------- episodes ----------
  /** challenge ids the host may pick right now */
  pickable() {
    const kind = this.twoTribes && !this.merged ? 'relay' : 'individual';
    return Object.values(CHALLENGE_META).filter((c) => c.kind === kind).map((c) => c.id);
  }

  startEpisode(id) {
    if (this.phase !== 'picker') return { ok: false, reason: 'Not between episodes.' };
    if (!this.pickable().includes(id)) return { ok: false, reason: 'That challenge is not available in this phase.' };
    this.episode++;
    this.challengeId = id;
    this.ranking = []; this.immunityId = null; this.team = null; this.tribal = null; this.groupTotals = {};
    this.results = []; this.runIndex = -1;
    const cfg = undefined;
    if (this.twoTribes && !this.merged) {
      this.episodeType = 'team'; this.queueKind = 'team';
      let order = GAME.tribes.map((t) => t.id);
      const f = GAME.relay.firstTribe;
      if (f === 'random') order = shuffle(order); else if (f === 'B') order.reverse();
      this.queue = [];
      for (const tid of order) {
        const ids = shuffle(this.members(tid));
        ids.forEach((pid, i) => this.queue.push({ playerId: pid, challengeId: id, group: tid, relay: true, turnIndex: i, groupIndex: i, groupCount: ids.length, cfg }));
      }
    } else {
      this.episodeType = 'individual'; this.queueKind = 'individual';
      const ids = GAME.shuffleTurnOrder ? shuffle(this.active.map((p) => p.id)) : this.active.map((p) => p.id);
      this.queue = ids.map((pid, i) => ({ playerId: pid, challengeId: id, group: 'solo', relay: false, turnIndex: i, cfg }));
    }
    this.nextRun();
    return { ok: true };
  }

  nextRun() {
    this.runIndex++;
    if (this.runIndex >= this.queue.length) return this.queueDone();
    const run = this.queue[this.runIndex];
    const prev = this.queue[this.runIndex - 1];
    this.run = run;
    this.headsetId = run.playerId;
    this.taps = {}; this.feed = [];
    if (!this.simulating) this._prepare(run);
    if (run.relay && prev && prev.group === run.group) {
      this.phase = 'handoff'; this.handoff = GAME.relay.handoffSeconds;       // clock keeps running
    } else {
      if (run.relay) { this.relayClock = 0; this.relayPenalty = 0; }
      this.phase = 'turnReady';
    }
    this.changed();
  }

  _prepare(run) {
    this.runner.prepare({ challengeId: run.challengeId, playerId: run.playerId, turnIndex: run.turnIndex, round: this.episode, cfg: run.cfg, relay: run.relay, group: run.group });
  }

  /** (re)build the headset scene for the current run - used after debug fast-forwards */
  reprepare() { if (this.run && ['turnReady', 'handoff'].includes(this.phase)) this._prepare(this.run); }

  beginTurn() {
    if (this.phase === 'turnReady') { this.phase = 'countdown'; this.countdown = GAME.turn.countdownSeconds; this.changed(); }
    else if (this.phase === 'handoff') { this.handoff = 0; this.startRunning(); }
  }

  startRunning() { this.phase = 'running'; if (!this.simulating) this.runner.start(); this.changed(); }

  update(dt) {
    if (this.run?.relay && (this.phase === 'running' || this.phase === 'handoff')) this.relayClock += dt;
    const tick = (next) => { this.timer -= dt; if (this.timer <= 0) next(); };
    switch (this.phase) {
      case 'countdown': {
        const before = Math.ceil(this.countdown);
        this.countdown -= dt;
        if (this.countdown <= 0) this.startRunning();
        else if (Math.ceil(this.countdown) !== before) this.changed();
        break;
      }
      case 'handoff': this.handoff -= dt; if (this.handoff <= 0) this.startRunning(); break;
      case 'turnResult': if (GAME.turn.autoAdvance) tick(() => this.advanceFromResult()); break;
      case 'finaleScores': tick(() => this.next()); break;
      case 'readout': if (GAME.vote.autoAdvanceReadout) tick(() => this.nextReadout()); break;
      case 'voting': if (this.tribal?.allIn && (this.tribal.allInTimer -= dt) <= 0) this.startReadout(); break;
      case 'tie': tick(() => this.continueTie()); break;
      case 'unanimous': this.updateUnanimous(dt); break;
      case 'draw': tick(() => this.finishDraw()); break;
      case 'tribalResult': if (GAME.turn.autoAdvance) tick(() => this.afterTribal()); break;
      case 'pitch': tick(() => this.nextPitch()); break;
      case 'jury': if (this.jury?.allIn && (this.jury.allInTimer -= dt) <= 0) this.startJuryReveal(); break;
      case 'juryReveal': tick(() => this.nextJuryReveal()); break;
    }
  }

  /** called by the runner when the headset run ends */
  finishTurn(result) {
    if (!this.run || !['running', 'countdown', 'turnReady', 'handoff'].includes(this.phase)) return;
    if (!this.simulating) this.runner.stop();
    const run = this.run;
    const r = { ...result, playerId: run.playerId, challengeId: run.challengeId, group: run.group };
    if (run.relay && r.dnf) this.relayPenalty += GAME.relay.dnfPenaltySeconds;
    r.display = formatValue(run.challengeId, r);
    this.results.push(r);
    this.lastResult = r;
    const next = this.queue[this.runIndex + 1];
    const groupEnds = !next || next.group !== run.group;
    if (run.relay && !groupEnds) {
      this.pushFeed('system', `${this.name(run.playerId)} is done - ${this.name(next.playerId)} steps in!`);
      return this.nextRun();
    }
    if (run.relay) this.groupTotals[run.group] = { time: this.relayClock, penalty: this.relayPenalty, total: this.relayTotal() };
    this.phase = 'turnResult';
    this.timer = GAME.turn.resultSeconds;
    this.changed();
  }

  advanceFromResult() {
    if (this.phase !== 'turnResult') return;
    const run = this.run, next = this.queue[this.runIndex + 1];
    if (this.episodeType === 'finale' && this.finale.stage === 'challenges' && (!next || next.group !== run.group)) return this.showFinaleScores(run.group);
    this.nextRun();
  }
  skipTurnResult() { this.advanceFromResult(); }

  queueDone() {
    this.headsetId = null; this.taps = {};
    if (this.queueKind === 'individual') {
      const map = {}; for (const r of this.results) map[r.playerId] = r;
      this.ranking = rankResults(this.challengeId, map, this.queue.map((q) => q.playerId));
      this.immunityId = this.ranking[0] || null;
      this.phase = 'roundResults';
    } else if (this.queueKind === 'team') {
      const totals = this.groupTotals;
      const ids = Object.keys(totals);
      let order = [...ids].sort((a, b) => totals[a].total - totals[b].total);
      if (order.length > 1 && totals[order[0]].total === totals[order[1]].total) order = shuffle(order);
      this.team = { totals, winning: order[0], losing: order[order.length - 1], order };
      this.phase = 'roundResults';
    } else if (this.queueKind === 'fire') {
      this.computeFire();
    }
    this.changed();
  }

  /** debug / host escape hatch: drop the current episode and return to the challenge picker */
  abortEpisode() {
    if (!this.started) return;
    this.headsetId = null; this.run = null; this.queue = []; this.taps = {}; this.tribal = null;
    if (this.episodeType === 'finale') { this.phase = 'finaleIntro'; this.finale.stage = 'intro'; } else this.phase = 'picker';
    this.changed();
  }

  // ---------- taps ----------
  tappers() {
    if (!this.run || !this.headsetId) return [];
    const act = this.active.filter((p) => p.id !== this.headsetId);
    // team phase: ONLY the tribe that is playing; the watching tribe gets nothing.
    // Sabotaging a teammate is allowed (and intended).
    return (this.episodeType === 'team' ? act.filter((p) => p.tribe === this.run.group) : act).map((p) => p.id);
  }

  tap(pid, kind) {
    if (this.phase !== 'running') return { ok: false, reason: 'Taps open once the run starts.' };
    if (pid === this.headsetId) return { ok: false, reason: 'You are in the headset!' };
    if (!this.tappers().includes(pid)) return { ok: false, reason: 'You cannot tap this run.' };
    if (kind !== 'help' && kind !== 'sabotage') return { ok: false, reason: 'bad tap' };
    if (this.taps[pid]) return { ok: false, reason: 'Already tapped this run.' };
    this.taps[pid] = kind;
    const effect = drawEffect(this.run.challengeId, kind);
    this.runner.applyEffect(effect, kind);
    this.pushFeed(kind, effect.feed);
    return { ok: true, effect };
  }

  tapsLeft() { return this.tappers().filter((id) => !this.taps[id]).length; }

  // ---------- tribal council ----------
  startTribal() {
    if (this.phase !== 'roundResults') return;
    let voters, targets, tribe = null;
    if (this.episodeType === 'team') {
      tribe = this.team.losing;
      voters = this.members(tribe); targets = [...voters];
    } else {
      voters = this.active.map((p) => p.id);
      targets = voters.filter((id) => id !== this.immunityId);
    }
    this.tribal = { kind: this.episodeType, tribe, stage: 'vote', voters, targets, baseTargets: [...targets], votes: {}, tied: [], history: [], picks: {}, voters2: [], draw: null, result: null, nextStage: null, readout: null, allIn: false, allInTimer: 0, deadline: 0 };
    // degenerate: nobody can vote for anybody else
    if (!targets.some((t) => voters.some((v) => v !== t))) return this.eliminate(targets[0] || voters[0], 'forced');
    this.phase = 'voting';
    this.changed();
  }

  votableTargets(forPid) {
    const T = this.tribal; if (!T) return [];
    return T.targets.filter((id) => GAME.vote.allowSelfVote || id !== forPid).map((id) => this.player(id)).filter(Boolean);
  }

  submitVote(pid, target, message) {
    const T = this.tribal;
    if (this.phase !== 'voting' || !T) return { ok: false, reason: 'Voting is not open.' };
    if (!T.voters.includes(pid)) return { ok: false, reason: 'You are not voting at this council.' };
    if (T.votes[pid]) return { ok: false, reason: 'Your vote is already in.' };
    if (!this.votableTargets(pid).some((p) => p.id === target)) return { ok: false, reason: 'You cannot vote for that player.' };
    const msg = String(message || '').trim();
    if (msg.length < GAME.vote.minChars) return { ok: false, reason: 'Say a little more.' };
    if (msg.length > GAME.vote.maxChars) return { ok: false, reason: `Max ${GAME.vote.maxChars} characters.` };
    if (countSentences(msg) > GAME.vote.maxSentences) return { ok: false, reason: `Max ${GAME.vote.maxSentences} sentences.` };
    T.votes[pid] = { target, message: msg };
    if (T.voters.every((v) => T.votes[v])) { T.allIn = true; T.allInTimer = 1.5; }
    this.changed();
    return { ok: true };
  }

  startReadout() {
    const T = this.tribal;
    if (this.phase !== 'voting' || !T) return;
    const entries = shuffle(Object.values(T.votes));     // shuffled + anonymous: no clue who wrote what
    if (!entries.length) return this.tallyStage();
    T.readout = { index: 0, entries };
    this.phase = 'readout';
    this.timer = GAME.vote.readoutSeconds;
    this.changed();
  }

  nextReadout() {
    const R = this.tribal?.readout;
    if (this.phase !== 'readout' || !R) return;
    R.index++;
    if (R.index >= R.entries.length) return this.tallyStage();
    this.timer = GAME.vote.readoutSeconds;
    this.changed();
  }

  skipReadout() { if (this.phase === 'voting') this.startReadout(); if (this.phase === 'readout') this.tallyStage(); }

  tallyStage() {
    const T = this.tribal;
    const counts = {};
    for (const v of Object.values(T.votes)) counts[v.target] = (counts[v.target] || 0) + 1;
    T.history.push({ stage: T.stage, counts });
    T.lastCounts = counts;
    const max = Math.max(0, ...Object.values(counts));
    const top = Object.keys(counts).filter((id) => counts[id] === max);
    if (top.length === 1) return this.eliminate(top[0], T.stage === 'vote' ? 'votes' : 'revote');
    T.tied = top.length ? top : [...T.targets];
    T.nextStage = T.stage === 'vote' ? 'revote' : 'unanimous';
    this.phase = 'tie';
    this.timer = GAME.vote.tieNoticeSeconds;
    this.changed();
  }

  continueTie() {
    const T = this.tribal;
    if (this.phase !== 'tie' || !T) return;
    if (T.nextStage === 'revote') {
      // EVERYONE votes again (tied players included) but only for the tied players
      T.stage = 'revote'; T.targets = [...T.tied]; T.votes = {}; T.allIn = false; T.readout = null;
      this.phase = 'voting';
    } else {
      T.stage = 'unanimous';
      T.voters2 = T.voters.filter((v) => !T.tied.includes(v));       // tied players do NOT vote
      T.picks = {};
      if (!T.voters2.length) return this.draw();
      T.deadline = GAME.vote.unanimousSeconds;
      T.agreeTimer = 0;
      this.phase = 'unanimous';
    }
    this.changed();
  }

  unanimousPick(pid, target) {
    const T = this.tribal;
    if (this.phase !== 'unanimous' || !T.voters2.includes(pid)) return { ok: false, reason: 'You cannot pick now.' };
    if (!T.tied.includes(target)) return { ok: false, reason: 'Pick one of the tied players.' };
    T.picks[pid] = target;
    const all = T.voters2.every((v) => T.picks[v]);
    const same = all && new Set(T.voters2.map((v) => T.picks[v])).size === 1;
    T.agreeTimer = same ? 1.5 : 0;
    this.changed();
    return { ok: true };
  }

  updateUnanimous(dt) {
    const T = this.tribal; if (!T) return;
    if (T.agreeTimer > 0) { T.agreeTimer -= dt; if (T.agreeTimer <= 0) return this.eliminate(T.picks[T.voters2[0]], 'unanimous'); }
    T.deadline -= dt;
    if (T.deadline <= 0) this.draw();
  }

  forceDeadlock() { if (this.phase === 'unanimous') this.draw(); }

  /** last resort: random draw among players who received NO votes (equal chance each) */
  draw() {
    const T = this.tribal;
    const voted = new Set();
    for (const h of T.history) for (const id of Object.keys(h.counts)) voted.add(id);
    let pool = T.baseTargets.filter((id) => !voted.has(id));
    if (!pool.length) pool = T.baseTargets.filter((id) => !T.tied.includes(id));
    if (!pool.length) pool = [...T.tied];
    T.draw = { pool, pick: pick(pool) };
    this.phase = 'draw';
    this.timer = GAME.vote.drawRevealSeconds;
    this.changed();
  }

  finishDraw() { if (this.phase === 'draw') this.eliminate(this.tribal.draw.pick, 'draw'); }

  eliminate(id, how) {
    const T = this.tribal, p = this.player(id);
    if (p) {
      p.status = this.merged ? 'juror' : 'out';          // post-merge (or one-tribe) voted-out players become jurors
      if (this.merged) this.jurors.push(id);
    }
    T.result = { eliminated: id, how, wasJuror: this.merged };
    this.phase = 'tribalResult';
    this.timer = GAME.vote.resultSeconds;
    this.changed();
  }

  afterTribal() {
    if (this.phase !== 'tribalResult') return;
    if (this.twoTribes && !this.merged) {
      const empty = GAME.tribes.some((t) => this.members(t.id).length === 0);
      if (this.active.length <= GAME.mergeAt || empty) return this.merge();
    }
    this.afterMerge();
  }

  merge() {
    this.merged = true;
    for (const p of this.players) { p.oldTribe = p.tribe; p.tribe = null; }
    this.phase = 'merge';
    this.changed();
  }

  afterMerge() {
    if (this.active.length <= GAME.finaleAt) return this.startFinale();
    this.phase = 'picker';
    this.changed();
  }

  // ---------- finale ----------
  startFinale() {
    const ids = this.active.map((p) => p.id);
    this.episodeType = 'finale'; this.merged = true;
    this.finale = { stage: 'intro', ids, points: Object.fromEntries(ids.map((i) => [i, 0])), rows: [], bests: {}, basketTime: {}, immunityId: null, tiebreak: null,
      fire: null, finalists: [], pitchOrder: [], pitchIndex: 0, finalScores: false };
    this.phase = 'finaleIntro';
    this.changed();
  }

  startFinaleRuns() {
    const F = this.finale;
    this.queue = []; this.results = []; this.runIndex = -1; this.queueKind = 'finale'; this.episode++;
    F.stage = 'challenges';
    for (const c of GAME.finale.order) {
      const cfg = GAME.finale.holdChallenges.includes(c) ? { timeLimit: GAME.finale.holdCapSeconds } : undefined;
      shuffle(F.ids).forEach((pid, i) => this.queue.push({ playerId: pid, challengeId: c, group: c, relay: false, turnIndex: i, cfg }));
    }
    this.nextRun();
  }

  showFinaleScores(challengeId) {
    const F = this.finale;
    const rs = this.results.filter((r) => r.challengeId === challengeId);
    const map = {}; for (const r of rs) map[r.playerId] = r;
    const placements = rankWithTies(challengeId, map, rs.map((r) => r.playerId));
    const pts = placementPoints(placements, GAME.finale.points);
    const entries = placements.map((p) => ({ id: p.id, rank: p.rank, tieSize: p.tieSize, points: pts[p.id], display: map[p.id].display }));
    for (const e of entries) {
      F.points[e.id] += e.points;
      F.bests[e.id] = Math.min(F.bests[e.id] ?? 99, e.rank);
      if (challengeId === 'basketball') F.basketTime[e.id] = map[e.id].dnf ? Infinity : map[e.id].value;
    }
    F.rows.push({ challengeId, entries });
    F.finalScores = challengeId === GAME.finale.order[GAME.finale.order.length - 1];
    this.phase = 'finaleScores';
    this.timer = GAME.finale.scoresSeconds;
    this.changed();
  }

  finishFinaleChallenges() {
    const F = this.finale;
    // highest total; tiebreakers: best single placement, then fastest basketball time
    const order = [...F.ids].sort((a, b) =>
      (F.points[b] - F.points[a]) ||
      ((F.bests[a] ?? 99) - (F.bests[b] ?? 99)) ||
      ((F.basketTime[a] ?? Infinity) - (F.basketTime[b] ?? Infinity)));
    F.standings = order;
    F.immunityId = order[0];
    const a = order[0], b = order[1];
    F.tiebreak = F.points[a] !== F.points[b] ? null : (F.bests[a] !== F.bests[b] ? 'best placement' : 'basketball time');
    this.immunityId = F.immunityId;
    this.phase = 'finaleImmunity';
    this.changed();
  }

  startFire() {
    const F = this.finale;
    F.stage = 'fire';
    const others = shuffle(F.ids.filter((id) => id !== F.immunityId));
    this.queue = others.map((pid, i) => ({ playerId: pid, challengeId: GAME.finale.fireChallenge, group: 'fire', relay: false, turnIndex: i }));
    this.queueKind = 'fire'; this.results = []; this.runIndex = -1; this.episode++;
    this.nextRun();
  }

  computeFire() {
    const F = this.finale;
    const map = {}; for (const r of this.results) map[r.playerId] = r;
    const order = this.queue.map((q) => q.playerId);
    const ranked = rankResults(GAME.finale.fireChallenge, map, order);
    const winner = ranked[0], loser = ranked[ranked.length - 1];
    F.fire = { winner, loser, results: map };
    const lp = this.player(loser);
    if (lp) { lp.status = 'juror'; this.jurors.push(loser); }
    F.finalists = [F.immunityId, winner];
    this.phase = 'fireResult';
  }

  startPitches() {
    const F = this.finale;
    F.stage = 'pitch'; F.pitchOrder = shuffle(F.finalists); F.pitchIndex = 0;
    this.phase = 'pitch'; this.timer = GAME.finale.pitchSeconds;
    this.changed();
  }

  nextPitch() {
    if (this.phase !== 'pitch') return;
    const F = this.finale;
    F.pitchIndex++;
    if (F.pitchIndex >= F.pitchOrder.length) return this.startJury();
    this.timer = GAME.finale.pitchSeconds;
    this.changed();
  }

  startJury() {
    const jurors = this.players.filter((p) => p.status === 'juror').map((p) => p.id);
    this.jury = { jurors, votes: {}, reveal: null, allIn: false, allInTimer: 0 };
    this.finale.stage = 'jury';
    this.phase = 'jury';
    this.changed();
  }

  submitJuryVote(pid, target) {
    const J = this.jury;
    if (this.phase !== 'jury' || !J) return { ok: false, reason: 'Jury voting is not open.' };
    if (!J.jurors.includes(pid)) return { ok: false, reason: 'Only jurors vote.' };
    if (J.votes[pid]) return { ok: false, reason: 'Your vote is already in.' };
    if (!this.finale.finalists.includes(target)) return { ok: false, reason: 'Pick a finalist.' };
    J.votes[pid] = target;
    if (J.jurors.every((j) => J.votes[j])) { J.allIn = true; J.allInTimer = 1.5; }
    this.changed();
    return { ok: true };
  }

  startJuryReveal() {
    const J = this.jury;
    if (this.phase !== 'jury' || !J) return;
    J.reveal = { index: 0, entries: shuffle(Object.entries(J.votes).map(([juror, target]) => ({ juror, target }))) };
    if (!J.reveal.entries.length) return this.crown();
    this.phase = 'juryReveal'; this.timer = GAME.finale.jury.revealSeconds;
    this.changed();
  }

  nextJuryReveal() {
    const R = this.jury?.reveal;
    if (this.phase !== 'juryReveal' || !R) return;
    R.index++;
    if (R.index >= R.entries.length) return this.crown();
    this.timer = GAME.finale.jury.revealSeconds;
    this.changed();
  }

  crown() {
    const F = this.finale, J = this.jury;
    const counts = Object.fromEntries(F.finalists.map((f) => [f, 0]));
    for (const t of Object.values(J.votes)) counts[t]++;
    const [a, b] = F.finalists;
    let winner;
    if (counts[a] !== counts[b]) winner = counts[a] > counts[b] ? a : b;
    else {
      const tb = GAME.finale.jury.tieBreak;
      winner = tb === 'random' ? pick(F.finalists) : tb === 'fireWinner' ? F.fire.winner : F.immunityId;
      J.tieBroken = tb;
    }
    J.counts = counts;
    this.winnerId = winner;
    this.phase = 'winner';
    this.changed();
  }

  // ---------- what phones and the TV get ----------
  publicState() {
    const T = this.tribal, F = this.finale, J = this.jury;
    let readout = null;
    if (T?.readout && this.phase === 'readout') {
      const R = T.readout, counts = {};
      for (let i = 0; i <= R.index; i++) counts[R.entries[i].target] = (counts[R.entries[i].target] || 0) + 1;
      const cur = R.entries[R.index];
      readout = { index: R.index, total: R.entries.length, current: { target: cur.target, message: cur.message }, counts };
    }
    let juryReveal = null;
    if (J?.reveal && (this.phase === 'juryReveal' || this.phase === 'winner')) {
      const R = J.reveal, upto = this.phase === 'winner' ? R.entries.length - 1 : R.index;
      const counts = Object.fromEntries(F.finalists.map((f) => [f, 0]));
      for (let i = 0; i <= upto; i++) counts[R.entries[i].target]++;
      juryReveal = { index: R.index, total: R.entries.length, shown: R.entries.slice(0, upto + 1), counts };
    }
    const phaseTimer = ['turnResult', 'finaleScores', 'readout', 'tie', 'draw', 'tribalResult', 'pitch', 'juryReveal'].includes(this.phase) ? Math.max(0, this.timer)
      : this.phase === 'handoff' ? Math.max(0, this.handoff) : this.phase === 'unanimous' ? Math.max(0, T.deadline) : 0;
    const tappers = this.tappers();
    const run = this.run;
    return {
      v: this.version, code: this.code,
      phase: this.phase, started: this.started,
      episode: this.episode, episodeType: this.episodeType, challengeId: this.challengeId,
      twoTribes: this.twoTribes, merged: this.merged,
      tribes: GAME.tribes,
      players: this.players.map((p) => ({ id: p.id, name: p.name, color: p.color, bot: p.bot, tribe: p.tribe, oldTribe: p.oldTribe, status: p.status })),
      headsetId: this.headsetId,
      run: run ? { group: run.group, relay: run.relay, index: run.groupIndex ?? run.turnIndex, count: run.groupCount ?? this.queue.filter((q) => q.group === run.group).length, challengeId: run.challengeId, n: this.runIndex + 1, of: this.queue.length } : null,
      countdown: Math.max(0, Math.ceil(this.countdown)),
      phaseTimer,
      relay: run?.relay ? { clock: this.relayTotal(), penalty: this.relayPenalty, group: run.group } : null,
      tappers, taps: this.taps, tapCount: Object.keys(this.taps).length, tapsLeft: this.tapsLeft(),
      lastResult: this.lastResult,
      ranking: this.ranking,
      results: Object.fromEntries(this.results.map((r) => [r.playerId, r])),
      immunityId: this.immunityId,
      team: this.team,
      tribal: T && {
        kind: T.kind, tribe: T.tribe, stage: T.stage, voters: T.voters, targets: T.targets, tied: T.tied,
        voted: this.phase === 'voting' ? Object.keys(T.votes) : [], voters2: T.voters2,
        pickCount: Object.keys(T.picks).length, picks: T.picks,
        readout, draw: T.draw, result: T.result, history: T.history, nextStage: T.nextStage, lastCounts: T.lastCounts || null,
      },
      finale: F && {
        stage: F.stage, ids: F.ids, points: F.points, rows: F.rows, immunityId: F.immunityId, tiebreak: F.tiebreak, standings: F.standings,
        fire: F.fire, finalists: F.finalists, pitchOrder: F.pitchOrder, pitchIndex: F.pitchIndex, finalScores: F.finalScores,
        holdCap: GAME.finale.holdCapSeconds, order: GAME.finale.order,
      },
      jury: J && { jurors: J.jurors, voted: this.phase === 'jury' ? Object.keys(J.votes) : [], reveal: juryReveal, counts: J.counts, tieBroken: J.tieBroken },
      winnerId: this.winnerId,
      jurors: this.jurors,
      feed: this.feed, notice: this.notice,
    };
  }
}
