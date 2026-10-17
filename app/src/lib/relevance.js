// Which plays matter to your fantasy teams, and for whom. A play matters if it gains or loses fantasy points for a
// player you have (or are facing), or if one of those players got hurt on it.

const INJURY = /\binjur|carted|helped off|locker room|trainer|evaluated for|limps? off|leaves? the game|left the game/i;
export const isInjuryText = text => INJURY.test(String(text || ''));

// 'help' when the play is good for you: points for your player, or points lost by a player you're facing.
// 'none' when the play is worth nothing to the player (no points either way).
export function effectOf(side, est, injury) {
  if (!est) return injury ? (side === 'mine' ? 'hurt' : 'help') : 'none';
  return (side === 'mine') === (est > 0) ? 'help' : 'hurt';
}

// A matched play (from matchPlays) reduced to the hits that matter, each tagged with injury and effect.
// Returns null when none do.
export function relevantPlay(play) {
  const injury = isInjuryText(play.text + ' ' + play.type);
  const hits = play.hits
    .filter(h => h.est !== 0 || injury)
    .map(h => ({ ...h, injury: injury && !h.est, effect: effectOf(h.side, h.est, injury) }));
  return hits.length ? { ...play, hits } : null;
}
