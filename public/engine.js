// Word Burn engine: which word comes next, and what a reading does to it. No screen or microphone code here.
import { LISTS, ALT, SCHOOL } from "./words.js";

export const ALLKEYS = [];
{ const seen = new Set(); for (const l of LISTS) for (const w of l.words) if (!seen.has(w)) { seen.add(w); ALLKEYS.push(w); } }
export const RANK = new Map(ALLKEYS.map((k, i) => [k, i]));
const RANK_LOW = new Set(ALLKEYS.map(k => k.toLowerCase().replace(/[’']/g, "")));

export const IV = [0, 0, 1, 3, 7, 16, 35, 90];   // days until the next check, by stage
export const CAP = 6;                            // words in practice before harder probes stop
export const HARD_CAP = 10;                      // words in practice before any new word stops
export const ROUND = 20;
export const SPRINT = 5;                           // cards at the end of a round given to the very short words
export const MAX_CHECKS = 5;                      // checks of burned words per round, so new words keep flowing

// lv is the version of the word order that `level` counts along; an older order's level is started again.
export const fresh = () => ({ v: 1, lv: 2, gen: 0, updated: 0, w: {}, al: {}, level: 30, step: 40, found: 0, rt: [], burned: 0, streak: { d: "", n: 0 }, best: { combo: 0 }, rounds: [], log: [] });
export const day = (d = new Date()) => Math.floor((d.getTime() - d.getTimezoneOffset() * 6e4) / 864e5);

// --- matching what was heard against the word shown ---
export const tokens = t => String(t).toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9 ]+/g, " ").trim().split(/\s+/).filter(Boolean);
export function matches(heard, key) {
  const toks = tokens(heard), ok = new Set([tokens(key).join(""), ...(ALT[key.toLowerCase()] || "").split(" ").filter(Boolean)]);
  for (let i = 0; i < toks.length; i++) { if (ok.has(toks[i])) return true; if (i + 1 < toks.length && ok.has(toks[i] + toks[i + 1])) return true; }
  return false;
}

// --- hearing a particular reader: benefit of the doubt, and learning how this reader says a word ---
const lev = (a, b) => { const d = Array.from({ length: b.length + 1 }, (_, j) => j); for (let i = 1; i <= a.length; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const q = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = q; } } return d[b.length]; };
const slack = n => (n <= 3 ? 0 : n <= 5 ? 1 : n <= 8 ? 2 : 3);       // letters that may differ; none for the very short words, where one letter makes another word
const other = (t, key) => t !== key && RANK_LOW.has(t);              // the heard word is a different word from the list: a real confusion, never forgiven
// How a heard text names the word shown: "exact", "own" (this reader's learned way of saying it), "close" (benefit of the doubt), or "".
export function hears(S, heard, key) {
  if (matches(heard, key)) return "exact";
  const k = tokens(key).join(""), mine = (S && S.al && S.al[key]) || {};
  for (const t of tokens(heard)) { if (other(t, k)) continue; if ((mine[t] | 0) >= 2) return "own"; }
  for (const t of tokens(heard)) { if (other(t, k)) continue; if (slack(k.length) && lev(t, k) <= slack(k.length)) return "close"; }
  return "";
}
// After a miss the reader repeats the word just spoken to them. What the phone hears then is very likely this reader's way of saying it:
// heard twice, it is accepted for this reader from then on.
export function learn(S, key, heard) {
  const k = tokens(key).join(""); if (!S.al) S.al = {};
  for (const t of tokens(heard).slice(0, 3)) { if (t === k || other(t, k) || t.length > 24) continue; const m = S.al[key] || (S.al[key] = {}); if (Object.keys(m).length < 6 || t in m) m[t] = Math.min(99, (m[t] | 0) + 1); }
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

// --- look-alike words: a new word is held back while one that looks like it is still being practised, or was the last card ---
const GROUPS = ["though through thought tough", "was saw", "were where wear we're", "there their they're three", "then than them", "when went want", "how who", "on no", "of off",
  "for from form", "what that", "with which", "will well", "came come", "here hear her", "quite quiet", "its it's", "your you're", "every very ever even"].map(g => g.split(" "));
const near = (a, b) => {                                             // one letter added, dropped or changed, or the same letters in another order
  if (a === b || Math.min(a.length, b.length) < 3) return false;
  if (a.length === b.length) { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d === 1 || [...a].sort().join("") === [...b].sort().join(""); }
  if (Math.abs(a.length - b.length) !== 1) return false;
  const [s, l] = a.length < b.length ? [a, b] : [b, a]; let i = 0; while (i < s.length && s[i] === l[i]) i++; return s.slice(i) === l.slice(i + 1);
};
export function alike(a, b) { a = a.toLowerCase(); b = b.toLowerCase(); return near(a, b) || GROUPS.some(g => g.includes(a) && g.includes(b)); }

// --- choosing the next card ---
// kinds: "side" a word in practice coming back, "check" a burned word due for its check,
//        "win" a burned word, given straight after a stumble or when nothing else is left,
//        "easy" the next unseen word of four letters or more, "probe" an unseen word out ahead, "sprint" a very short unseen word, "win" a burned word for an easy success.
export function newRound() { return { i: 0, last: {}, lastSide: -9, newCount: 0, checks: 0, prev: null, lift: false, recent: [] }; }
// How the round is going, from the last eight cards: "up" when nearly everything is instant, "down" when under about two in three are.
// The aim is a round where roughly 85% of reads are instant: harder words when cruising, easier ones on a bad day.
export function mood(R) { const a = R.recent || []; if (a.length < 4) return "even"; const r = a.reduce((x, y) => x + y, 0) / a.length; return r >= 0.9 ? "up" : r < 0.67 ? "down" : "even"; }
export function pick(S, R, today = day(), rand = Math.random) {
  const seenNow = k => k in R.last, age = k => (k in R.last ? R.last[k] : -99);
  const side = ALLKEYS.filter(k => S.w[k] && S.w[k].s === 1);
  const ready = side.filter(k => R.i - age(k) >= 3).sort((a, b) => age(a) - age(b));
  const m = mood(R);
  // A word the reader already owns, for a sure success: straight after a miss, and every other card on a bad day.
  // Owned words that are due their check come first, so the easy card also does useful work.
  if (R.lift || (m === "down" && R.i % 2 === 0)) {
    const own = ALLKEYS.filter(k => S.w[k] && S.w[k].s >= 2 && k !== R.prev), fresh1 = own.filter(k => !seenNow(k));
    const dueOwn = fresh1.filter(k => S.w[k].d <= today).sort((a, b) => S.w[a].d - S.w[b].d);
    if (dueOwn.length) return { key: dueOwn[0], kind: "check", lift: true };
    const from = fresh1.length ? fresh1 : own;
    if (from.length) return { key: from[Math.floor(rand() * from.length)], kind: "win" };
  }
  const due = ALLKEYS.filter(k => S.w[k] && S.w[k].s >= 2 && S.w[k].d <= today && !seenNow(k)).sort((a, b) => S.w[a].d - S.w[b].d);
  let other = null;
  const unseenLeft = ALLKEYS.some(k => !S.w[k] && !seenNow(k)) && side.length < HARD_CAP;
  if (due.length && (R.checks < MAX_CHECKS || !unseenLeft) && (R.i % 3 === 1 || !unseenLeft)) other = { key: due[0], kind: "check" };
  else if (side.length < HARD_CAP) {
    const held = k => side.some(x => alike(k, x)) || (R.prev != null && alike(k, R.prev));
    const unseen = ALLKEYS.filter(k => !S.w[k] && !seenNow(k) && !held(k));
    if (unseen.length) {
      // Words of four letters or more carry the game. The very short ones ("I", "the") are swept up in a quick run at the end of each round.
      const long = unseen.filter(k => k.length >= 4), tiny = unseen.filter(k => k.length < 4);
      if (tiny.length && (R.i >= ROUND - SPRINT || !long.length)) other = { key: tiny[0], kind: "sprint" };
      else if (long.length) {
        // While still looking for the reader's edge, or when the round is going very well: easy, probe, easy, probe. Otherwise: easy, easy, probe. On a bad day: no probes.
        const probeTurn = m !== "down" && (S.found && m !== "up" ? R.newCount % 3 === 2 : R.newCount % 2 === 1) && side.length < CAP;
        // A reader who has not stumbled by the top of the list is probed from the top down.
        const ahead = long.find(k => RANK.get(k) >= S.level) || (S.found ? null : long[long.length - 1]);
        other = probeTurn && ahead && ahead !== long[0] ? { key: ahead, kind: "probe" } : { key: long[0], kind: "easy" };
      }
    }
  }
  if (!other) { const wins = ALLKEYS.filter(k => S.w[k] && S.w[k].s >= 2 && !seenNow(k)); if (wins.length) other = { key: wins[Math.floor(rand() * wins.length)], kind: "win" }; }
  if (ready.length && (!other || R.i - R.lastSide >= (m === "down" ? 4 : 3))) return { key: ready[0], kind: "side" };   // at most one card in three
  if (other) return other;
  const rest = side.filter(k => k !== R.prev).sort((a, b) => age(a) - age(b));
  if (rest.length || side.length) return { key: rest[0] || side[0], kind: "side" };
  return null;
}
// Record a reading: grade it, move the frontier if it was a probe, advance the round.
export function apply(S, R, card, out, rt, today = day()) {
  const g = grade(S, card.key, out, rt, today), rank = RANK.get(card.key);
  if (card.kind === "probe") {                                       // search for the reader's edge: leap further after each hit, halve the leap after a stumble
    const step = S.step || 40;
    if (out === "fast") { S.level = Math.min(ALLKEYS.length, rank + step); S.step = Math.min(160, step * 2); }
    else { S.level = out === "slow" ? rank + 5 : Math.max(0, rank - Math.round(step / 2)); S.step = Math.max(10, Math.round(step / 2)); S.found = 1; }
  }
  else if (card.kind === "easy" && rank >= S.level) S.level = rank + 1;
  if (card.kind === "probe" || card.kind === "easy") R.newCount++;
  if (card.kind === "side") R.lastSide = R.i;
  if (card.kind === "check" && !card.lift) R.checks++;
  (R.recent || (R.recent = [])).push(out === "fast" ? 1 : 0); if (R.recent.length > 8) R.recent.shift();
  R.lift = out === "miss" && card.kind !== "win" && !card.lift;                     // one easy card after a miss, never two in a row
  R.last[card.key] = R.i; R.prev = card.key; R.i++;
  if (g.burnedNow) S.burned++;
  return g;
}
export function counts(S, words = ALLKEYS) { const c = { un: 0, side: 0, burned: 0, locked: 0 }; for (const k of words) c[band(S, k)]++; return c; }

// --- joining two copies of one player's progress (two phones, or a phone and the family store) ---
// Each word keeps whichever record has been read more times. A reset (higher gen) wins outright.
export function mergeState(a, b) {
  if (!a) return b; if (!b) return a;
  if ((a.gen | 0) !== (b.gen | 0)) return (a.gen | 0) > (b.gen | 0) ? a : b;
  const hi = (a.updated | 0) >= (b.updated | 0) ? a : b, lo = hi === a ? b : a, w = {};
  for (const k of [...new Set([...Object.keys(a.w || {}), ...Object.keys(b.w || {})])].sort()) { const x = hi.w[k], y = lo.w[k]; w[k] = !y ? x : !x ? y : (y.n > x.n ? y : x); }
  const byT = list => { const m = new Map(); for (const r of list) if (r && r.t) m.set(r.t, r); return [...m.values()].sort((p, q) => p.t - q.t); };
  const al = {}; for (const src of [lo.al || {}, hi.al || {}]) for (const k of Object.keys(src)) for (const t of Object.keys(src[k] || {})) { (al[k] || (al[k] = {}))[t] = Math.max((al[k] && al[k][t]) | 0, src[k][t] | 0); }
  const out = Object.assign(fresh(), { al, gen: hi.gen | 0, updated: Math.max(a.updated | 0, b.updated | 0), w, level: hi.level, step: hi.step || 40, found: hi.found ? 1 : 0, rt: (hi.rt || []).slice(-20), streak: hi.streak || { d: "", n: 0 },
    best: { combo: Math.max((a.best && a.best.combo) || 0, (b.best && b.best.combo) || 0) }, rounds: byT([...(lo.rounds || []), ...(hi.rounds || [])]).slice(-60), log: byT([...(lo.log || []), ...(hi.log || [])]).slice(-30) });
  out.burned = Object.values(w).filter(x => x.s >= 2).length;
  return out;
}
// A state from storage or the network: keep only what the game understands.
export function cleanState(x) {
  if (!x || typeof x !== "object" || typeof x.w !== "object" || !x.w) return null;
  const w = {}; let n = 0;
  for (const k of Object.keys(x.w)) { if (!RANK.has(k) || ++n > 900) continue; const v = x.w[k]; if (!v || typeof v !== "object") continue; const o = { s: Math.max(1, Math.min(7, v.s | 0)), d: v.d | 0, r: v.r | 0, n: v.n | 0, m: v.m | 0, b: v.b | 0 }; if (v.k) o.k = 1; w[k] = o; }
  const num = (v, d) => (Number.isFinite(v) ? v : d), str = v => String(v == null ? "" : v).slice(0, 40);
  if ((x.lv | 0) < 2) x = Object.assign({}, x, { level: 30, step: 40, found: 0 });   // the words were reordered: look for the reader's edge afresh
  const al = {}; if (x.al && typeof x.al === "object") for (const k of Object.keys(x.al)) { if (!RANK.has(k) || !x.al[k] || typeof x.al[k] !== "object") continue; for (const t of Object.keys(x.al[k]).slice(0, 6)) if (/^[a-z0-9]{1,24}$/.test(t)) (al[k] || (al[k] = {}))[t] = Math.max(0, Math.min(99, x.al[k][t] | 0)); }
  return Object.assign(fresh(), { al, gen: x.gen | 0, updated: num(x.updated, 0), w, level: Math.max(0, Math.min(ALLKEYS.length, x.level | 0)), step: Math.max(10, Math.min(160, (x.step | 0) || 40)), found: x.found ? 1 : 0, rt: (Array.isArray(x.rt) ? x.rt : []).filter(Number.isFinite).slice(-20),
    streak: { d: str(x.streak && x.streak.d), n: (x.streak && x.streak.n) | 0 }, best: { combo: (x.best && x.best.combo) | 0 },
    rounds: (Array.isArray(x.rounds) ? x.rounds : []).filter(r => r && Number.isFinite(r.t)).slice(-60).map(r => ({ t: r.t, n: r.n | 0, fast: r.fast | 0, miss: r.miss | 0, voice: r.voice ? 1 : 0 })),
    log: (Array.isArray(x.log) ? x.log : []).filter(r => r && Number.isFinite(r.t)).slice(-30).map(r => ({ t: r.t, k: str(r.k), heard: str(r.heard) })),
    burned: Object.values(w).filter(v => v.s >= 2).length });
}
export { LISTS, SCHOOL };
