// Round-loop tunables. Edit freely - nothing else hard-codes these.
export const GAME = {
  minPlayers: 3,
  maxPlayers: 6,
  shuffleTurnOrder: true,        // randomise who goes first each round

  turn: {
    countdownSeconds: 3,         // 3-2-1 before the clock starts
    resultSeconds: 4,            // how long a single run's result stays on the TV before the next turn
    autoAdvance: true,           // false = host must press "Next"
  },

  // Phone taps during someone else's run
  taps: {
    perRun: 1,                   // exactly one tap, HELP or SABOTAGE (not both). Resets every run.
  },

  vote: {
    maxChars: 160,
    maxSentences: 2,             // "1-2 sentences"
    minChars: 3,
    readoutSeconds: 8,           // per vote on the TV
    autoAdvanceReadout: true,
    allowSelfVote: false,
    immunityWinnerCanBeVoted: false,
  },

  // false = the most-voted player is just "named" (prototype keeps everyone in the game).
  // true  = they are removed from future rounds.
  eliminateVotedOut: false,

  // How many recent effects the TV feed keeps
  feedLength: 8,

  // TV mirror of the headset view (JPEG frames over the relay)
  tv: {
    mirrorFps: 8,
    mirrorFpsInXR: 4,
    mirrorWidth: 480,
    mirrorHeight: 270,
    jpegQuality: 0.6,
  },

  playerColors: ['#ef5b3c', '#f2b134', '#3fbf7f', '#3aa3d9', '#b06ad6', '#ec7fb4'],
  botNames: ['Coconut', 'Mango', 'Tiki', 'Parrot', 'Lava', 'Reef'],
};
