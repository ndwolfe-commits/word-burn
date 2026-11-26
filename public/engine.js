// Word Burn engine: which word comes next, and what a reading does to it. No screen or microphone code here.
import { LISTS, ALT } from "./words.js";

export const ALLKEYS = [];
{ const seen = new Set(); for (const l of LISTS) for (const w of l.words) if (!seen.has(w)) { seen.add(w); ALLKEYS.push(w); } }
export const RANK = new Map(ALLKEYS.map((k, i) => [k, i]));

export const IV = [0, 0, 1, 3, 7, 16, 35, 90];   // days until the next check, by stage
export const CAP = 6;                            // words in practice before harder probes stop
export const HARD_CAP = 10;                      // words in practice before any new word stops
export const ROUND = 20;
export const MAX_CHECKS = 5;                      // checks of burned words per round, so new words keep flowing

export const fresh = () => ({ v: 1, w: {}, level: 20, rt: [], burned: 0, streak: { d: "", n: 0 }, best: { combo: 0 }, rounds: [] });
export const day = (d = new Date()) => Math.floor((d.getTime() - d.getTimezoneOffset() * 6e4) / 864e5);

// --- matching what was heard against the word shown ---
export const tokens = t => String(t).toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9 ]+/g, " ").trim().split(/\s+/).filter(Boolean);
export function matches(heard, key) {
  const toks = tokens(heard), ok = new Set([tokens(key).join(""), ...(ALT[key.toLowerCase()] || "").split(" ").filter(Boolean)]);
  for (let i = 0; i < toks.length; i++) { if (ok.has(toks[i])) return true; if (i + 1 < toks.length && ok.has(toks[i] + toks[i + 1])) return true; }
  return false;
}

// --- what counts as instant for this reader ---
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export function instantMs(S) {
  if (S.rt.length < 6) return 1800;                                   // until we know the reader's own speed
  return Math.round(Math.min(2500, Math.max(900, median(S.rt) * 1.5 + 150)));
}

// --- grading: out is "fast" (right and instant), "slow" (right after a pause) or "miss" ---
export const band = (S, k) => { const w = S.w[k]; return !w ? "un" : w.s === 1 ? "side" : w.s < 4 ? "burned" : "locked"; };
export function grade(S, key, out, rt, today = day()) {
  let w = S.w[key]; const first = !w;
  if (!w) w = S.w[key] = { s: 1, d: 0, r: 0, n: 0, m: 0, b: 0 };
  const before = first ? 0 : w.s; w.n++;
  if (out === "miss") w.m++; else if (rt > 0) { rt = Math.round(rt); if (!w.b || rt < w.b) w.b = rt; }
  if (first) { if (out === "fast") { w.s = 3; w.k = 1; w.d = today + 7; } }        // known already: one check in a week
  else if (w.s === 1) { if (out === "fast") { if (++w.r >= 3) { w.s = 2; w.r = 0; w.d = today + IV[2]; } } else if (out === "miss") w.r = 0; }
  else if (out === "miss") { w.s = 1; w.r = 0; delete w.k; }                       // forgotten: back to the side
  else if (w.d <= today) {
    if (out === "fast") w.s = w.k ? 6 : Math.min(7, w.s + 1);                      // a word known from the start needs only that one check
    else { w.s = Math.max(2, w.s - 1); delete w.k; }
    w.d = today + (out === "fast" ? IV[w.s] : 1);
  }
  if (out !== "miss" && rt > 0 && rt <= 2500 && (first ? out === "fast" : before >= 2)) { S.rt.push(rt); if (S.rt.length > 20) S.rt.shift(); }
  return { before, after: w.s, burnedNow: before < 2 && w.s >= 2 };
}

// --- choosing the next card ---
// kinds: "side" a word in practice coming back, "check" a burned word due for its check,
//        "easy" the next unseen word in order, "probe" an unseen word out ahead, "win" a burned word for an easy success.
export function newRound() { return { i: 0, last: {}, lastSide: -9, newCount: 0, checks: 0, prev: null }; }
export function pick(S, R, today = day(), rand = Math.random) {
  const seenNow = k => k in R.last, age = k => (k in R.last ? R.last[k] : -99);
  const side = ALLKEYS.filter(k => S.w[k] && S.w[k].s === 1);
  const ready = side.filter(k => R.i - age(k) >= 3).sort((a, b) => age(a) - age(b));
  const due = ALLKEYS.filter(k => S.w[k] && S.w[k].s >= 2 && S.w[k].d <= today && !seenNow(k)).sort((a, b) => S.w[a].d - S.w[b].d);
  let other = null;
  const unseenLeft = ALLKEYS.some(k => !S.w[k] && !seenNow(k)) && side.length < HARD_CAP;
  if (due.length && (R.checks < MAX_CHECKS || !unseenLeft) && (R.i % 3 === 1 || !unseenLeft)) other = { key: due[0], kind: "check" };
  else if (side.length < HARD_CAP) {
    const unseen = ALLKEYS.filter(k => !S.w[k] && !seenNow(k));
    if (unseen.length) {
      const probeTurn = R.newCount % 3 === 2 && side.length < CAP;                   // easy, easy, probe
      const ahead = unseen.find(k => RANK.get(k) >= S.level);
      other = probeTurn && ahead && ahead !== unseen[0] ? { key: ahead, kind: "probe" } : { key: unseen[0], kind: "easy" };
    }
  }
  if (!other) { const wins = ALLKEYS.filter(k => S.w[k] && S.w[k].s >= 2 && !seenNow(k)); if (wins.length) other = { key: wins[Math.floor(rand() * wins.length)], kind: "win" }; }
  if (ready.length && (!other || R.i - R.lastSide >= 3)) return { key: ready[0], kind: "side" };   // at most one card in three
  if (other) return other;
  const rest = side.filter(k => k !== R.prev).sort((a, b) => age(a) - age(b));
  if (rest.length || side.length) return { key: rest[0] || side[0], kind: "side" };
  return null;
}
// Record a reading: grade it, move the frontier if it was a probe, advance the round.
export function apply(S, R, card, out, rt, today = day()) {
  const g = grade(S, card.key, out, rt, today), rank = RANK.get(card.key);
  if (card.kind === "probe") S.level = out === "fast" ? Math.min(ALLKEYS.length, rank + 25) : out === "slow" ? rank + 5 : Math.max(0, rank - 15);
  else if (card.kind === "easy" && rank >= S.level) S.level = rank + 1;
  if (card.kind === "probe" || card.kind === "easy") R.newCount++;
  if (card.kind === "side") R.lastSide = R.i;
  if (card.kind === "check") R.checks++;
  R.last[card.key] = R.i; R.prev = card.key; R.i++;
  if (g.burnedNow) S.burned++;
  return g;
}
export function counts(S, words = ALLKEYS) { const c = { un: 0, side: 0, burned: 0, locked: 0 }; for (const k of words) c[band(S, k)]++; return c; }
export { LISTS };
