/* ROUNDS: THE SAME PERSON SPEAKING MORE THAN ONCE IN ONE SESSION.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────
 *
 * A peer card is stored at `session/speaker/scorer`. There was no round anywhere in that
 * key, and the peer write path never read the prior record before writing. So the second
 * time the same person scored the same speaker, the first card was replaced. Not merged,
 * not versioned: gone.
 *
 * On 9 November that cost a session. The facilitator wanted a second round after feedback,
 * was told a second round would overwrite the first, and created a WHOLE SECOND SESSION to
 * protect round one. That splits the same humans across two rooms, and because refFor()
 * digests the session id together with the address, the same person has a different ref in
 * each one. Two sheets per person that can never be joined, for five people who simply
 * spoke twice.
 *
 * ── THE KEY SHAPE, AND WHY A SUFFIX RATHER THAN A FOURTH SEGMENT ──────────────────────
 *
 *   round 1   session/speaker/scorer           <- unchanged, so every existing record is
 *   round 2   session/speaker/scorer~2            already a valid round 1 and nothing needs
 *   round 3   session/speaker/scorer~3            migrating
 *
 * A fourth path segment was the obvious alternative and is the wrong one. Four readers
 * check `parts.length === 3` to tell a card from the `_stage` record: drill-results,
 * drill-roster, drill-my-sheet and drill-stage's own roomSize(). A fourth segment silently
 * drops every round-two card out of all four, which is the same data loss wearing a
 * different hat. A suffix keeps the segment count at three forever.
 *
 * `~` is deliberate. Refs are 12 hex characters, so `~` cannot occur inside one and the
 * split is never ambiguous. It is also in the blob key charset, unlike `#`, and needs no
 * percent-encoding: drill-score.mjs already records what percent-encoding does to a key
 * here, which is that the store encodes it again and the record can never be read back.
 *
 * ── WHO DECIDES THE ROUND ─────────────────────────────────────────────────────────────
 *
 * The server, from `rounds` on the stage record, never the page. This is the same lesson
 * as the before/after half in drill-score: when the page was trusted to say which half it
 * was writing, it overwrote two real pre-speech readings on 22 October because the page
 * had not caught up with the floor. A page that has been open since round one does not
 * know round two has started, and asking it is how round one gets overwritten again.
 */

/* The separator cannot appear in a ref, which is 12 hex characters. */
const SEP = '~';

/* Round 1 writes the bare ref, so a store written before rounds existed reads back as a
   complete round 1 with no migration and no special case at the call site. */
export function roundKey(ref, round) {
  const n = Number(round);
  return (!Number.isFinite(n) || n <= 1) ? String(ref) : `${ref}${SEP}${n}`;
}

/* The ref without its round, for grouping a person's rounds back together. */
export function baseRef(segment) {
  const i = String(segment).indexOf(SEP);
  return i === -1 ? String(segment) : String(segment).slice(0, i);
}

/* Which round a stored segment belongs to. Absent suffix means round 1. */
export function roundOf(segment) {
  const i = String(segment).indexOf(SEP);
  if (i === -1) return 1;
  const n = parseInt(String(segment).slice(i + 1), 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/* A self record is the speaker scoring themselves, which is the two segments matching
   once their rounds are stripped. Comparing the raw segments instead would read
   `abc/abc~2` as a peer card from a stranger who happens to share your ref. */
export function isSelf(speakerSeg, scorerSeg) {
  return baseRef(speakerSeg) === baseRef(scorerSeg);
}

/* The round a speaker is currently on, from the stage record. Zero means they have never
   taken the floor, which is different from one: nobody has scored them yet. */
export function currentRound(stage, ref) {
  const rounds = (stage && stage.rounds && typeof stage.rounds === 'object') ? stage.rounds : {};
  const n = Number(rounds[baseRef(ref)]);
  return Number.isFinite(n) && n >= 1 ? n : 0;
}
