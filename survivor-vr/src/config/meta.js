// Display info for each challenge (picker, TV, phones). Light - no three.js import.
export const CHALLENGE_META = {
  basketball: {
    id: 'basketball', name: 'Tiki Hoops', icon: '🏀',
    blurb: 'Sink all 5 hoops - any order. Fastest time wins.',
    desktopHelp: 'Mouse: aim at a hoop · HOLD left click to charge · RELEASE to shoot',
  },
  endurance: {
    id: 'endurance', name: 'Idol Endurance', icon: '🗿',
    blurb: 'Idol overhead in one hand, ball on a stick in the other. Last longest.',
    desktopHelp: 'Mouse: tilt the stick to keep the ball on · WASD: hold the idol up and steady',
  },
  puzzle: {
    id: 'puzzle', name: 'Jungle Jigsaw', icon: '🧩',
    blurb: 'Snap floating pieces into the frame. Fastest wins.',
    desktopHelp: 'Drag pieces with the mouse · R or right-click: rotate / flip a piece',
  },
  balance: {
    id: 'balance', name: 'Tray Balance', icon: '🍽️',
    blurb: 'Balance a growing stack of blocks on a tray. Last longest.',
    desktopHelp: 'Move the mouse to tilt the tray and keep the stack steady',
  },
};
export const CHALLENGE_LIST = Object.values(CHALLENGE_META);
