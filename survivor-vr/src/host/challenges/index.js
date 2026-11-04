import { Basketball } from './basketball.js';
import { Endurance } from './endurance.js';
import { Puzzle } from './puzzle.js';
import { Balance } from './balance.js';

// Register challenges here (id must match src/config/{meta,challenges,effects,scoring}.js).
export const CHALLENGE_CLASSES = {
  basketball: Basketball,
  endurance: Endurance,
  puzzle: Puzzle,
  balance: Balance,
};
export { CHALLENGE_LIST } from '../../config/meta.js';
