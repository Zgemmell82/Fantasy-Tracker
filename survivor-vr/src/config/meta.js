// Display info for each challenge (picker, TV, phones). Light - no three.js import.
export const CHALLENGE_META = {
  basketball: {
    id: 'basketball', kind: 'individual', name: 'Tiki Hoops', icon: '🏀',
    blurb: 'Sink all 5 hoops - any order. Fastest time wins.',
    desktopHelp: 'Mouse: aim at a hoop · HOLD left click to charge · RELEASE to shoot',
  },
  endurance: {
    id: 'endurance', kind: 'individual', name: 'Idol Endurance', icon: '🗿',
    blurb: 'Idol overhead in one hand, ball on a stick in the other. Last longest.',
    desktopHelp: 'Mouse: tilt the stick to keep the ball on · WASD: hold the idol up and steady',
  },
  puzzle: {
    id: 'puzzle', kind: 'individual', name: 'Jungle Jigsaw', icon: '🧩',
    blurb: 'Snap floating pieces into the frame. Fastest wins.',
    desktopHelp: 'Drag pieces with the mouse · R or right-click: rotate / flip a piece',
  },
  balance: {
    id: 'balance', kind: 'individual', name: 'Tray Balance', icon: '🍽️',
    blurb: 'Balance a growing stack of blocks on a tray. Last longest.',
    desktopHelp: 'Move the mouse to tilt the tray and keep the stack steady',
  },
  supply: {
    id: 'supply', kind: 'relay', name: 'Supply Sort', icon: '🥥',
    blurb: 'RELAY: drop every item into its matching basket. Pile empty = done.',
    desktopHelp: 'Drag items with the mouse into the matching basket',
  },
  rope: {
    id: 'rope', kind: 'relay', name: 'Tangled Rope', icon: '🪢',
    blurb: 'RELAY: slide each loop off its posts in the right order until the rope is free.',
    desktopHelp: 'Drag a free (uncovered) loop away from its pegs to slide it off',
  },
  fire: {
    id: 'fire', kind: 'fire', name: 'Fire Making', icon: '🔥',
    blurb: 'Strike the fire-steel, then feed the ember with kindling until the flame is big.',
    desktopHelp: 'STRIKE: flick the mouse quickly side to side · FAN/FEED: keep flicking, drag kindling onto the fire when the heat bar is green',
  },
};
export const CHALLENGE_LIST = Object.values(CHALLENGE_META);
