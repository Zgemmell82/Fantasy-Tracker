// Debug helpers: simulate phone players and jump straight to any phase of the game.
// Everything goes through the real Game methods, so what you land on is a real game state.
import { GAME } from '../config/game.js';
import { SCORING } from '../config/scoring.js';
import { RUN_PHASES } from './game.js';

export const JUMPS = [
  ['lobby', 'Lobby (players join)'],
  ['tribes', 'Tribes revealed (two tribes)'],
  ['teamReady', 'Team relay: first runner ready'],
  ['teamResults', 'Team relay: results (losing tribe)'],
  ['teamTribal', 'Team tribal: vote (losing tribe)'],
  ['tie', 'Tribal: tie notice'],
  ['revote', 'Tribal: revote (tied players only)'],
  ['unanimous', 'Tribal: unanimous decision stage'],
  ['draw', 'Tribal: random draw'],
  ['merge', 'Merge (8 players left)'],
  ['individual', 'Individual challenge (post-merge)'],
  ['individualResults', 'Individual results + immunity'],
  ['tribal', 'Individual tribal vote'],
  ['finale', 'Finale intro (3 left, jury seated)'],
  ['finaleRun', 'Finale: first headset run'],
  ['finaleScores', 'Finale: first challenge scores'],
  ['finaleImmunity', 'Finale: immunity winner'],
  ['fire', 'Fire-making: first runner'],
  ['fireResult', 'Fire-making result'],
  ['pitch', 'Finalist pitches'],
  ['jury', 'Jury voting'],
  ['juryReveal', 'Jury vote reveal'],
  ['winner', 'Winner crowned'],
];

const rand = (a, b) => a + Math.random() * (b - a);

export function createDebug(game, hooks = {}) {
  const D = {};

  D.fakeResult = (challengeId) => {
    const rule = SCORING[challengeId];
    const cap = GAME.finale.holdChallenges.includes(challengeId) && game.episodeType === 'finale' ? GAME.finale.holdCapSeconds : 200;
    const v = rule.better === 'lower' ? rand(15, 70) : Math.min(cap, rand(10, 140));
    return { value: +v.toFixed(2), dnf: false, progress: 5 };
  };

  /** fast-forward every remaining headset run (random results) until the phase leaves the run loop */
  D.runAll = () => {
    let guard = 0;
    while (game.run && RUN_PHASES.includes(game.phase) && guard++ < 400) {
      if (game.phase === 'turnResult') game.advanceFromResult();
      else game.finishTurn(D.fakeResult(game.run.challengeId));
    }
  };

  D.botsTap = () => {
    for (const id of game.tappers()) if (!game.taps[id]) game.tap(id, Math.random() < 0.5 ? 'help' : 'sabotage');
  };

  const LINES = ['You have been coasting. Time to go.', 'Too strong, too smooth. Gotta cut the threat!', 'I do not trust you. Sorry.', 'Your shady alliance talk was obvious.', 'Nothing personal, just strategy.', 'You sabotaged me and I know it.'];

  /** mode 'random' | 'tie' (engineers an exact two-way tie; an odd voter abstains) | 'first' */
  D.botsVote = (mode = 'random') => {
    const T = game.tribal; if (!T || game.phase !== 'voting') return;
    const voters = T.voters.filter((v) => !T.votes[v]);
    if (mode === 'tie') {
      const ts = T.targets.filter((t) => T.voters.includes(t));
      const X = ts[0], Y = ts[1];
      const others = T.voters.filter((v) => v !== X && v !== Y);
      const m = others.length - (others.length % 2);          // even number of "others" so the split is equal
      const plan = { [X]: Y, [Y]: X };
      others.slice(0, m).forEach((v, i) => { plan[v] = i % 2 ? X : Y; });
      for (const [v, t] of Object.entries(plan)) if (!T.votes[v]) game.submitVote(v, t, LINES[Math.floor(Math.random() * LINES.length)]);
      return;
    }
    for (const v of voters) {
      const opts = game.votableTargets(v); if (!opts.length) continue;
      const t = mode === 'first' ? opts[0] : opts[Math.floor(Math.random() * opts.length)];
      game.submitVote(v, t.id, LINES[Math.floor(Math.random() * LINES.length)]);
    }
  };

  /** unanimous stage: 'agree' = everyone picks the same tied player, 'split' = they disagree */
  D.botsPick = (mode = 'agree') => {
    const T = game.tribal; if (game.phase !== 'unanimous') return;
    T.voters2.forEach((v, i) => game.unanimousPick(v, T.tied[mode === 'agree' ? 0 : i % T.tied.length]));
  };

  D.botsJury = (target) => {
    if (game.phase !== 'jury') return;
    const f = game.finale.finalists;
    for (const j of game.jury.jurors) game.submitJuryVote(j, target || f[Math.floor(Math.random() * f.length)]);
  };

  // ---------- jumps ----------
  function fresh(n) {
    game.simulating = true;
    game.resetGame(); game.players = [];
    for (let i = 0; i < n; i++) game.addBot();
  }
  const finish = () => { game.simulating = false; game.reprepare(); hooks.onJump?.(); game.changed(); };

  function toTribal(tie) {
    D.botsVote(tie ? 'tie' : 'random'); game.startReadout(); game.skipReadout();
  }

  D.jump = (target, n) => {
    try {
      const need = (k, dflt) => Math.max(k, n || dflt);
      const rel = () => ['supply', 'rope'][Math.floor(Math.random() * 2)];
      const ind = () => ['basketball', 'endurance', 'puzzle', 'balance'][Math.floor(Math.random() * 4)];
      const startTeam = () => { fresh(need(10, 12)); game.startGame(); game.next(); game.startEpisode(rel()); };
      const startInd = () => { fresh(need(4, 8)); game.startGame(); game.startEpisode(ind()); };
      const startFin = () => {
        fresh(7); game.startGame();   // 7 players, one tribe
        // seat a jury: 4 jurors, 3 finalists
        game.players.slice(0, 4).forEach((p) => { p.status = 'juror'; game.jurors.push(p.id); });
        game.startFinale();
      };
      const advanceFinaleRuns = (stopAt) => {
        game.next();
        let guard = 0;
        while (guard++ < 40 && game.phase !== stopAt) {
          if (RUN_PHASES.includes(game.phase)) D.runAll(); else if (game.phase === 'finaleScores' || game.phase === 'finaleIntro') game.next(); else break;
        }
      };
      switch (target) {
        case 'lobby': fresh(need(3, 12)); break;
        case 'tribes': fresh(need(10, 12)); game.startGame(); break;
        case 'teamReady': startTeam(); break;
        case 'teamResults': startTeam(); D.runAll(); break;
        case 'teamTribal': startTeam(); D.runAll(); game.next(); break;
        case 'tie': startTeam(); D.runAll(); game.next(); toTribal(true); break;
        case 'revote': startTeam(); D.runAll(); game.next(); toTribal(true); game.continueTie(); break;
        case 'unanimous': startTeam(); D.runAll(); game.next(); toTribal(true); game.continueTie(); toTribal(true); game.continueTie(); break;
        case 'draw': startTeam(); D.runAll(); game.next(); toTribal(true); game.continueTie(); toTribal(true); game.continueTie(); game.forceDeadlock(); break;
        case 'merge': {
          fresh(need(10, 10)); game.startGame();
          for (const tid of ['A', 'B']) { const m = game.members(tid)[0]; game.player(m).status = 'out'; }
          game.merge(); break;
        }
        case 'individual': startInd(); break;
        case 'individualResults': startInd(); D.runAll(); break;
        case 'tribal': startInd(); D.runAll(); game.next(); break;
        case 'finale': startFin(); break;
        case 'finaleRun': startFin(); game.next(); break;
        case 'finaleScores': startFin(); game.next(); D.runAll(); break;
        case 'finaleImmunity': startFin(); advanceFinaleRuns('finaleImmunity'); break;
        case 'fire': startFin(); advanceFinaleRuns('finaleImmunity'); game.next(); break;
        case 'fireResult': startFin(); advanceFinaleRuns('finaleImmunity'); game.next(); D.runAll(); break;
        case 'pitch': startFin(); advanceFinaleRuns('finaleImmunity'); game.next(); D.runAll(); game.next(); break;
        case 'jury': startFin(); advanceFinaleRuns('finaleImmunity'); game.next(); D.runAll(); game.next(); game.nextPitch(); game.nextPitch(); break;
        case 'juryReveal': startFin(); advanceFinaleRuns('finaleImmunity'); game.next(); D.runAll(); game.next(); game.nextPitch(); game.nextPitch(); D.botsJury(); game.startJuryReveal(); break;
        case 'winner': startFin(); advanceFinaleRuns('finaleImmunity'); game.next(); D.runAll(); game.next(); game.nextPitch(); game.nextPitch(); D.botsJury(); game.startJuryReveal(); while (game.phase === 'juryReveal') game.nextJuryReveal(); break;
      }
    } finally { finish(); }
  };

  return D;
}
