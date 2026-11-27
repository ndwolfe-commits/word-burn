// Word Burn engine: which word comes next, and what a reading does to it. No screen or microphone code here.
import { LISTS, ALT, SCHOOL } from "./words.js";

export const ALLKEYS = [];
{ const seen = new Set(); for (const l of LISTS) for (const w of l.words) if (!seen.has(w)) { seen.add(w); ALLKEYS.push(w); } }
export const RANK = new Map(ALLKEYS.map((k, i) => [k, i]));

export const IV = [0, 0, 1, 3, 7, 16, 35, 90];   // days until the next check, by stage
export const CAP = 6;                            // words in practice before harder probes stop
export const HARD_CAP = 10;                      // words in practice before any new word stops
export const ROUND = 20;
export const SPRINT = 5;                           // cards at the end of a round given to the very short words
export const MAX_CHECKS = 5;                      // checks of burned words per round, so new words keep flowing

// lv is the version of the word order that `level` counts along; an older order's level is started again.
export const fresh = () => ({ v: 1, lv: 2, gen: 0, updated: 0, w: {}, level: 30, step: 40, found: 0, rt: [], burned: 0, streak: { d: "", n: 0 }, best: { combo: 0 }, rounds: [], log: [] });
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
//        "easy" the next unseen word of four letters or more, "probe" an unseen word out ahead, "sprint" a very short unseen word, "win" a burned word for an easy success.
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
      // Words of four letters or more carry the game. The very short ones ("I", "the") are swept up in a quick run at the end of each round.
      const long = unseen.filter(k => k.length >= 4), tiny = unseen.filter(k => k.length < 4);
      if (tiny.length && (R.i >= ROUND - SPRINT || !long.length)) other = { key: tiny[0], kind: "sprint" };
      else if (long.length) {
        // While still looking for the reader's edge: easy, probe, easy, probe. Once found: easy, easy, probe.
        const probeTurn = (S.found ? R.newCount % 3 === 2 : R.newCount % 2 === 1) && side.length < CAP;
        // A reader who has not stumbled by the top of the list is probed from the top down.
        const ahead = long.find(k => RANK.get(k) >= S.level) || (S.found ? null : long[long.length - 1]);
        other = probeTurn && ahead && ahead !== long[0] ? { key: ahead, kind: "probe" } : { key: long[0], kind: "easy" };
      }
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
  if (card.kind === "probe") {                                       // search for the reader's edge: leap further after each hit, halve the leap after a stumble
    const step = S.step || 40;
    if (out === "fast") { S.level = Math.min(ALLKEYS.length, rank + step); S.step = Math.min(160, step * 2); }
    else { S.level = out === "slow" ? rank + 5 : Math.max(0, rank - Math.round(step / 2)); S.step = Math.max(10, Math.round(step / 2)); S.found = 1; }
  }
  else if (card.kind === "easy" && rank >= S.level) S.level = rank + 1;
  if (card.kind === "probe" || card.kind === "easy") R.newCount++;
  if (card.kind === "side") R.lastSide = R.i;
  if (card.kind === "check") R.checks++;
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
  const out = Object.assign(fresh(), { gen: hi.gen | 0, updated: Math.max(a.updated | 0, b.updated | 0), w, level: hi.level, step: hi.step || 40, found: hi.found ? 1 : 0, rt: (hi.rt || []).slice(-20), streak: hi.streak || { d: "", n: 0 },
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
  return Object.assign(fresh(), { gen: x.gen | 0, updated: num(x.updated, 0), w, level: Math.max(0, Math.min(ALLKEYS.length, x.level | 0)), step: Math.max(10, Math.min(160, (x.step | 0) || 40)), found: x.found ? 1 : 0, rt: (Array.isArray(x.rt) ? x.rt : []).filter(Number.isFinite).slice(-20),
    streak: { d: str(x.streak && x.streak.d), n: (x.streak && x.streak.n) | 0 }, best: { combo: (x.best && x.best.combo) | 0 },
    rounds: (Array.isArray(x.rounds) ? x.rounds : []).filter(r => r && Number.isFinite(r.t)).slice(-60).map(r => ({ t: r.t, n: r.n | 0, fast: r.fast | 0, miss: r.miss | 0, voice: r.voice ? 1 : 0 })),
    log: (Array.isArray(x.log) ? x.log : []).filter(r => r && Number.isFinite(r.t)).slice(-30).map(r => ({ t: r.t, k: str(r.k), heard: str(r.heard) })),
    burned: Object.values(w).filter(v => v.s >= 2).length });
}
export { LISTS, SCHOOL };
