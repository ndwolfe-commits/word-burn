import test from "node:test";
import assert from "node:assert/strict";
import { ALLKEYS, RANK, fresh, grade, pick, apply, newRound, matches, instantMs, counts, IV, ROUND, mergeState, cleanState } from "../public/engine.js";

test("the word sets load, with duplicates removed", () => { assert.equal(ALLKEYS.length, 507); assert.equal(RANK.get("the"), 0); });

test("matching accepts same-sounding and US spellings, and rejects near misses", () => {
  assert.ok(matches("There", "their")); assert.ok(matches("End", "and")); assert.ok(matches("And a", "a")); assert.ok(!matches("The what", "to")); assert.ok(matches("Favorite.", "favourite")); assert.ok(matches("I'm", "I'm"));
  assert.ok(matches("grand dad", "granddad")); assert.ok(matches("the", "the"));
  assert.ok(!matches("though", "through")); assert.ok(!matches("then", "the")); assert.ok(!matches("women", "woman"));
});

test("a word read instantly on first sight is burned, checked once a week later, then locked in", () => {
  const S = fresh(); const g = grade(S, "the", "fast", 600, 100);
  assert.equal(g.after, 3); assert.equal(S.w.the.d, 107); assert.ok(g.burnedNow);
  const g2 = grade(S, "the", "fast", 600, 107); assert.equal(g2.after, 6, "one clean check locks it in"); assert.equal(S.w.the.d, 107 + IV[6]);
});
test("a missed word goes to the side and needs three instant reads in a row", () => {
  const S = fresh(); grade(S, "through", "miss", 0, 100); assert.equal(S.w.through.s, 1);
  grade(S, "through", "fast", 700, 100); grade(S, "through", "slow", 2400, 100); grade(S, "through", "fast", 700, 100);
  assert.equal(S.w.through.s, 1, "a slow read does not reset the run, and does not add to it");
  grade(S, "through", "miss", 0, 100); grade(S, "through", "fast", 700, 100); grade(S, "through", "fast", 700, 100);
  assert.equal(S.w.through.s, 1); const g = grade(S, "through", "fast", 700, 100);
  assert.equal(g.after, 2); assert.equal(S.w.through.d, 101);
});
test("a burned word that is later missed goes back to the side", () => {
  const S = fresh(); grade(S, "said", "fast", 600, 100); grade(S, "said", "miss", 0, 103); assert.equal(S.w.said.s, 1);
});
test("instant is set from the reader's own speed once there is enough of it", () => {
  const S = fresh(); assert.equal(instantMs(S), 1800);
  for (let i = 0; i < 8; i++) grade(S, ALLKEYS[i], "fast", 700, 100);
  assert.equal(instantMs(S), 1200);
});

// A pretend reader who knows every word up to a frontier instantly and has trouble past it.
function play(frontier, rounds, seed = 1) {
  let x = seed; const rand = () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const S = fresh(); let cards = 0, right = 0; const learned = new Map();
  for (let r = 0; r < rounds; r++) {
    const today = 200 + r, R = newRound();
    for (let i = 0; i < ROUND; i++) {
      const card = pick(S, R, today, rand); if (!card) break;
      const rank = RANK.get(card.key), seen = learned.get(card.key) || 0;
      const knows = rank < frontier ? rand() < 0.97 : rand() < Math.min(0.9, 0.15 + seen * 0.3);
      learned.set(card.key, seen + 1);
      const out = knows ? (rank < frontier || seen > 2 ? "fast" : "slow") : "miss";
      apply(S, R, card, out, out === "fast" ? 650 : 2200, today); cards++; if (out !== "miss") right++;
    }
  }
  if (process.env.SHOW) console.log("frontier", frontier, "rounds", rounds, "cards", cards, "rate", (right / cards).toFixed(2), JSON.stringify(counts(S)), "level", S.level);
  return { S, cards, rate: right / cards, c: counts(S) };
}
test("a reader with a frontier at 180 mostly succeeds while the easy words are swept up", () => {
  const { S, rate, c } = play(180, 12);
  assert.ok(rate >= 0.8, "success rate " + rate.toFixed(2));
  assert.ok(c.burned + c.locked >= 110, "burned " + (c.burned + c.locked));
  assert.ok(c.side <= 12, "side pile " + c.side);
  assert.ok(S.level >= 150 && S.level <= 260, "frontier estimate " + S.level);
});
test("a strong reader gets through the whole list in a bounded number of rounds", () => {
  const { c, cards } = play(507, 40);
  assert.equal(c.un, 0, "unseen left " + c.un); assert.ok(cards <= 40 * ROUND);
});
test("a weak reader is not flooded: the side pile stays capped", () => {
  const { c, rate } = play(15, 10);
  assert.ok(c.side <= 12, "side pile " + c.side); assert.ok(rate >= 0.5, "success rate " + rate.toFixed(2));
});
test("harder words turn up quickly for a reader who keeps hitting the probes", () => {
  const S = fresh(), R = newRound(); const probes = [];
  for (let i = 0; i < ROUND; i++) { const card = pick(S, R, 300, () => 0.5); if (card.kind === "probe") probes.push(RANK.get(card.key)); apply(S, R, card, "fast", 600, 300); }
  assert.ok(probes.length >= 4, "probes in one round: " + probes.length);
  assert.ok(probes[probes.length - 1] >= 300, "last probe reached rank " + probes[probes.length - 1] + " of " + ALLKEYS.length);
});
test("the same word is not shown twice in a row", () => {
  let x = 7; const rand = () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const S = fresh(), R = newRound(); let prev = null;
  for (let i = 0; i < 60; i++) { const card = pick(S, R, 300, rand); if (!card) break; assert.notEqual(card.key, prev); prev = card.key; apply(S, R, card, rand() < 0.5 ? "miss" : "fast", 700, 300); }
});

test("two phones' progress join without losing either one's words", () => {
  const a = fresh(), b = fresh();
  grade(a, "the", "fast", 600, 100); grade(a, "said", "miss", 0, 100); a.updated = 1000;
  grade(b, "said", "miss", 0, 100); grade(b, "said", "fast", 700, 100); grade(b, "people", "fast", 650, 100); b.updated = 2000;
  const m = mergeState(a, b), m2 = mergeState(b, a);
  assert.deepEqual(Object.keys(m.w).sort(), ["people", "said", "the"]);
  assert.equal(m.w.said.n, 2, "the copy with more reads of a word wins");
  assert.equal(JSON.stringify(m), JSON.stringify(m2), "the order of joining does not matter");
  assert.equal(JSON.stringify(mergeState(m, a)), JSON.stringify(m), "joining again changes nothing");
});
test("a reset on one phone is not undone by an older copy", () => {
  const old = fresh(); grade(old, "the", "fast", 600, 100); old.updated = 5000;
  const wiped = fresh(); wiped.gen = 1; wiped.updated = 6000;
  assert.deepEqual(mergeState(old, wiped).w, {}); assert.deepEqual(mergeState(wiped, old).w, {});
});
test("progress from outside is cleaned before use", () => {
  assert.equal(cleanState(null), null); assert.equal(cleanState({ w: 3 }), null);
  const c = cleanState({ w: { the: { s: 99, n: 2 }, "not-a-word": { s: 2 }, said: "x" }, level: 99999, rt: [700, "x"], rounds: [{ t: 1, n: 20 }, 5], extra: "<script>" });
  assert.deepEqual(Object.keys(c.w), ["the"]); assert.equal(c.w.the.s, 7); assert.equal(c.level, ALLKEYS.length); assert.deepEqual(c.rt, [700]); assert.equal(c.rounds.length, 1); assert.equal(c.extra, undefined);
});
test("a round opens with words of four letters or more and ends with a run of very short ones", () => {
  const S = fresh(), R = newRound(), seen = [];
  for (let i = 0; i < ROUND; i++) { const card = pick(S, R, 300, () => 0.5); seen.push(card); apply(S, R, card, "fast", 600, 300); }
  assert.ok(seen.slice(0, ROUND - 5).every(c => c.key.length >= 4), seen.map(c => c.key).join(" "));
  assert.ok(seen.slice(ROUND - 5).every(c => c.kind === "sprint" && c.key.length < 4));
});
test("a reader who never stumbles keeps getting hard words after reaching the top of the list", () => {
  const S = fresh(); let probes = 0;
  for (let r = 0; r < 3; r++) { const R = newRound(); for (let i = 0; i < ROUND; i++) { const card = pick(S, R, 300, () => 0.5); if (r === 2 && card.kind === "probe") probes++; apply(S, R, card, "fast", 600, 300); } }
  assert.ok(probes >= 5, "probes in the third round: " + probes);
});
