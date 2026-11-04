import { Basketball } from './basketball.js';
import { Endurance } from './endurance.js';
import { Puzzle } from './puzzle.js';
import { Balance } from './balance.js';
import { Supply } from './supply.js';
import { Rope } from './rope.js';
import { Fire } from './fire.js';

// Register challenges here (id must match src/config/{meta,challenges,effects,scoring}.js).
export const CHALLENGE_CLASSES = {
  basketball: Basketball, endurance: Endurance, puzzle: Puzzle, balance: Balance,   // individual
  supply: Supply, rope: Rope,                                                       // team relays
  fire: Fire,                                                                       // finale
};
export { CHALLENGE_LIST } from '../../config/meta.js';
