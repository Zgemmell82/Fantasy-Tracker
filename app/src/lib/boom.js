// What counts as a boom, shared by the Two-Minute Drill and the season history.
// A player is "booming" in a league when his live score is at least 120% of his original projection in that
// league's scoring, and at least 5 points over it (so a 3-point projection that becomes 4 doesn't count).
export const BOOM_RATIO = 1.2, BOOM_MIN_GAIN = 5;
export const boomOf = (pts, proj) => typeof pts === 'number' && proj != null && proj > 0 && pts >= proj * BOOM_RATIO && pts - proj >= BOOM_MIN_GAIN;
// The points a player has to reach to count as booming: 120% of his projection and at least 5 over it.
export const boomPoints = proj => Math.round(Math.max(proj * BOOM_RATIO, proj + BOOM_MIN_GAIN) * 10) / 10;
// Live score against projection, as a fraction (0.1 = 10% over). null without both numbers.
export const overBy = (pts, proj) => typeof pts === 'number' && proj != null && proj > 0 ? (pts - proj) / proj : null;

