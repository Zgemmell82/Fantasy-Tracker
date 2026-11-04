// Whole-game flow tunables. Edit freely - nothing else hard-codes these.
export const GAME = {
  // ----- lobby / tribes -----
  minPlayers: 3,
  maxPlayers: 14,
  roomCodeLength: 4,
  twoTribeMinPlayers: 10,        // fewer than this = one tribe (and no merge). Split is as even as possible, extra goes to tribe A.
  mergeAt: 8,                    // two-tribe game: tribes merge when this many players remain
  finaleAt: 3,                   // finale when this many players remain
  tribes: [
    { id: 'A', name: 'Tiki', color: '#f2a33a' },
    { id: 'B', name: 'Kaleo', color: '#3aa3d9' },
  ],
  shuffleTurnOrder: true,

  // ----- one headset run -----
  turn: {
    countdownSeconds: 3,         // 3-2-1 before the clock starts
    resultSeconds: 4,            // how long a run's result stays on the TV
    autoAdvance: true,           // false = host must press Next
  },

  // ----- relays (team phase) -----
  relay: {
    handoffSeconds: 4,           // clock KEEPS RUNNING while the next teammate steps in
    dnfPenaltySeconds: 30,       // added to the tribe total when a teammate times out
    firstTribe: 'random',        // 'A' | 'B' | 'random'  (tribes play one at a time; the other watches)
  },

  // ----- phone taps: one per headset run, HELP or SABOTAGE -----
  // Eligible: players still in the game on the ACTIVE tribe (team phase) / everyone still in (individual + finale).
  // The watching tribe, jurors and eliminated players get none. Self-sabotage of a teammate is allowed.
  taps: { perRun: 1 },

  // ----- tribal council -----
  vote: {
    maxChars: 160,
    maxSentences: 2,
    minChars: 3,
    readoutSeconds: 8,           // per vote on the TV
    autoAdvanceReadout: true,
    allowSelfVote: false,
    tieNoticeSeconds: 6,
    unanimousSeconds: 90,        // tie-break #2: non-tied voters must all agree on one tied player
    drawRevealSeconds: 6,        // tie-break #3: random draw among players with no votes
    resultSeconds: 8,
  },

  // ----- finale -----
  finale: {
    order: ['basketball', 'endurance', 'puzzle', 'balance'],
    holdChallenges: ['endurance', 'balance'],
    holdCapSeconds: 120,         // players who survive the cap tie for that placement and split the points
    points: [5, 3, 1],           // 1st, 2nd, 3rd (ties split the sum of the spots they cover)
    scoresSeconds: 8,
    fireChallenge: 'fire',
    pitchSeconds: 60,
    jury: { tieBreak: 'immunityWinner', revealSeconds: 4 },   // tieBreak: 'immunityWinner' | 'fireWinner' | 'random'
  },

  feedLength: 8,

  // TV mirror of the headset view (JPEG frames over the relay)
  tv: { mirrorFps: 8, mirrorFpsInXR: 4, mirrorWidth: 480, mirrorHeight: 270, jpegQuality: 0.6 },

  playerColors: ['#ef5b3c', '#f2b134', '#3fbf7f', '#3aa3d9', '#b06ad6', '#ec7fb4', '#8fd14f', '#4fd1c5', '#e8e0a0', '#ff8a65', '#7986cb', '#a1887f', '#d4e157', '#90a4ae'],
  botNames: ['Coconut', 'Mango', 'Tiki', 'Parrot', 'Lava', 'Reef', 'Kiwi', 'Guava', 'Palm', 'Surf', 'Conch', 'Flint', 'Ember', 'Tide'],
};
