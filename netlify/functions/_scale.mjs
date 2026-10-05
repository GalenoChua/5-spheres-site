/* The scoring scale, in one place, because it is read in six files and a
 * reader that disagrees with the writer does not error. It returns a number
 * that is wrong by about a factor of two and looks entirely plausible.
 *
 * Moved from 1 to 5 to 1 to 10 on 4 October 2026. A five-point scale has one
 * usable threshold, its own midpoint, so "below 50% is weak" was an artefact
 * of the scale rather than a judgement anybody made.
 *
 * Records written from that date carry `scale: 10` and a bumped version.
 * Anything stored before it carries neither, so the fallback is 5.
 */

export const SCALE_MAX = 10;
export const SCALE = Array.from({ length: SCALE_MAX }, (_, i) => i + 1);

/* Record shapes are versioned separately, so each has its own first
   ten-point version. A record that names its own scale is trusted over
   either, which is what makes a later change cheap. */
const FIRST_TEN = { drill: 2, quad: 4 };

export function scaleOf(rec, shape) {
  if (rec && Number.isFinite(rec.scale)) { return rec.scale; }
  const first = FIRST_TEN[shape];
  if (!first) { throw new Error(`scaleOf: unknown shape ${shape}`); }
  return (rec && rec.version >= first) ? SCALE_MAX : 5;
}

/* The span is one less than the top of the scale. 1 is the floor, not zero,
   so a person who ticks the lowest box everywhere reads 0% rather than 20%. */
export const spanOf = (rec, shape) => scaleOf(rec, shape) - 1;

export function pctOf(mean, rec, shape) {
  if (mean === null || mean === undefined) { return null; }
  return Math.round((mean - 1) / spanOf(rec, shape) * 100);
}

/* Provisional, and labelled as such on every surface that shows them. Set
   from the NPS convention rather than from our own data, because we have
   none yet. Revisit after two ASC sessions of thirteen companies, which is
   roughly 260 ratings. */
export const BANDS = { strong: 8, neutral: 6, provisional: true };

export function bandOf(score) {
  if (score === null || score === undefined) { return null; }
  if (score >= BANDS.strong) { return 'strong'; }
  if (score >= BANDS.neutral) { return 'neutral'; }
  return 'weak';
}
