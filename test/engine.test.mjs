import test from "node:test";
import assert from "node:assert/strict";
import { ALLKEYS, RANK, fresh, grade, pick, apply, newRound, matches, instantMs, counts, IV, ROUND, mergeState, cleanState, mood, alike, hears, learn } from "../public/engine.js";

test("the word sets load, with duplicates removed", () => { assert.equal(ALLKEYS.length, 707); assert.equal(RANK.get("the"), 0); });

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
  assert.ok(c.burned + c.locked >= 100, "burned " + (c.burned + c.locked));
  assert.ok(c.side <= 12, "side pile " + c.side);
  assert.ok(S.level >= 150 && S.level <= 260, "frontier estimate " + S.level);
});
test("a strong reader gets through the whole list in a bounded number of rounds", () => {
  const { c, cards } = play(707, 60);
  assert.equal(c.un, 0, "unseen left " + c.un); assert.ok(cards <= 60 * ROUND);
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
  const c = cleanState({ w: { the: { s: 99, n: 2 }, "not-a-word": { s: 2 }, said: "x" }, lv: 2, level: 99999, rt: [700, "x"], rounds: [{ t: 1, n: 20 }, 5], extra: "<script>" });
  assert.deepEqual(Object.keys(c.w), ["the"]); assert.equal(c.w.the.s, 7); assert.equal(c.level, ALLKEYS.length); assert.deepEqual(c.rt, [700]); assert.equal(c.rounds.length, 1); assert.equal(c.extra, undefined);
  assert.equal(cleanState({ w: {}, level: 400, found: 1 }).level, 30, "a level counted along the old word order starts again");
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
test("a miss is followed by a word the reader already owns", () => {
  const S = fresh(), R = newRound(); let after = 0, lifted = 0;
  for (let i = 0; i < 60; i++) {
    const card = pick(S, R, 300, () => 0.5), stumble = i > 8 && i % 5 === 0 && card.kind !== "win";
    if (after) { after = 0; lifted++; assert.equal(card.kind, "win", "card after a stumble was " + card.kind + " " + card.key); assert.ok(S.w[card.key].s >= 2); }
    apply(S, R, card, stumble ? "miss" : "fast", 600, 300); if (stumble) after = 1;
    if (R.i >= ROUND) Object.assign(R, newRound());
  }
  assert.ok(lifted >= 5, "lifts seen: " + lifted);
});
test("on a bad day the round eases off: no harder words, and owned words every other card", () => {
  const S = fresh(), R = newRound();
  for (let i = 0; i < 12; i++) apply(S, R, pick(S, R, 300, () => 0.5), "fast", 600, 300);      // some owned words first
  const kinds = [];
  for (let i = 0; i < 16; i++) { const card = pick(S, R, 300, () => 0.5); kinds.push(card.kind); apply(S, R, card, card.kind === "easy" || card.kind === "probe" || card.kind === "side" ? "miss" : "fast", 600, 300); if (R.i >= ROUND) { const keep = R.recent; Object.assign(R, newRound(), { recent: keep }); } }
  assert.equal(mood(R), "down", kinds.join(" "));
  const late = kinds.slice(8); assert.ok(!late.includes("probe"), late.join(" ")); assert.ok(late.filter(k => k === "win" || k === "check").length >= 4, late.join(" "));
});
test("when the reader is flying, a harder word comes every other new word even after an earlier stumble", () => {
  const S = fresh(); S.found = 1; const R = newRound(); let probes = 0, fresh2 = 0;
  for (let i = 0; i < 15; i++) { const card = pick(S, R, 300, () => 0.5); if (card.kind === "probe") probes++; if (card.kind === "probe" || card.kind === "easy") fresh2++; apply(S, R, card, "fast", 600, 300); }
  assert.equal(mood(R), "up"); assert.ok(probes >= fresh2 / 2 - 2, probes + " probes in " + fresh2 + " new words");
});
test("an owned word that is due its check is used as the easy card after a miss", () => {
  const S = fresh(), R = newRound();
  for (let i = 0; i < 6; i++) apply(S, R, pick(S, R, 300, () => 0.5), "fast", 600, 300);
  const R2 = newRound(); const first = pick(S, R2, 310, () => 0.5); apply(S, R2, first, "miss", 0, 310);
  const next = pick(S, R2, 310, () => 0.5); assert.equal(next.kind, "check"); assert.ok(next.lift); assert.ok(S.w[next.key].d <= 310);
});
test("look-alike words are recognised", () => {
  for (const [a, b] of [["was", "saw"], ["though", "through"], ["thought", "through"], ["will", "well"], ["where", "were"], ["look", "looks"], ["form", "from"]]) assert.ok(alike(a, b), a + " / " + b);
  for (const [a, b] of [["said", "they"], ["the", "and"], ["house", "about"], ["is", "it"]]) assert.ok(!alike(a, b), a + " / " + b);
});
test("a new word is held back while its look-alike is still being practised", () => {
  const S = fresh(); S.w.through = { s: 1, d: 0, r: 0, n: 1, m: 1, b: 0 }; S.level = RANK.get("though") - 3;
  const seen = [];
  for (let r = 0; r < 4; r++) { const R = newRound(); for (let i = 0; i < ROUND; i++) { const card = pick(S, R, 300, () => 0.5); if (card.kind !== "side") seen.push(card.key); apply(S, R, card, card.key === "through" ? "miss" : "fast", 600, 300); } }
  assert.ok(!seen.includes("though") && !seen.includes("thought"), "shown while 'through' was in practice: " + seen.filter(k => alike(k, "through")).join(" "));
});
test("a near miss by the phone gets the benefit of the doubt, but a different word from the list never does", () => {
  const S = fresh();
  assert.equal(hears(S, "Said", "said"), "exact");
  assert.equal(hears(S, "Wabbit", "rabbit"), "close"); assert.equal(hears(S, "fwend", "friend"), "close"); assert.equal(hears(S, "Togever", "together"), "close");
  assert.equal(hears(S, "than", "then"), "", "then/than is a real confusion"); assert.equal(hears(S, "saw", "was"), ""); assert.equal(hears(S, "though", "through"), "");
  assert.equal(hears(S, "tie", "the"), "", "no slack on the very short words"); assert.equal(hears(S, "banana", "said"), "");
});
test("a reader's own way of saying a word is learned from saying it back twice, and travels between phones", () => {
  const S = fresh();
  assert.equal(hears(S, "wed", "red"), "");
  learn(S, "red", "Wed"); assert.equal(hears(S, "wed", "red"), "", "once is not enough");
  learn(S, "red", "wed"); assert.equal(hears(S, "Wed", "red"), "own");
  learn(S, "was", "saw"); learn(S, "was", "saw"); assert.equal(hears(S, "saw", "was"), "", "a different list word is never learned");
  const c = cleanState(JSON.parse(JSON.stringify(Object.assign(S, { lv: 2 })))); assert.equal(hears(c, "wed", "red"), "own");
  assert.equal(hears(mergeState(fresh(), c), "wed", "red"), "own");
  assert.deepEqual(cleanState({ w: {}, al: { red: { "<b>": 5 }, nope: { x: 3 } } }).al, {});
});
test("a word waved through on a near miss is on a shorter leash until the phone hears it properly", () => {
  const S = fresh();
  grade(S, "rabbit", "fast", 600, 100, true); assert.equal(S.w.rabbit.d, 101, "back the next day, not in a week"); assert.equal(S.w.rabbit.q, 1);
  grade(S, "rabbit", "fast", 600, 101, true); assert.equal(S.w.rabbit.s, 3, "a second near miss does not move it up"); assert.equal(S.w.rabbit.d, 104);
  grade(S, "rabbit", "fast", 600, 104, false); assert.equal(S.w.rabbit.q, undefined); assert.equal(S.w.rabbit.s, 3); assert.equal(S.w.rabbit.d, 111, "heard properly: now its week");
  grade(S, "rabbit", "fast", 600, 111, false); assert.equal(S.w.rabbit.s, 6, "and then it is locked");
  grade(S, "friend", "fast", 600, 100, false); assert.equal(S.w.friend.d, 107); grade(S, "friend", "fast", 600, 107, false); assert.equal(S.w.friend.s, 6, "a properly heard word is unchanged: one check, then locked");
  assert.equal(cleanState(Object.assign(S, { lv: 2 })).w.rabbit.q, undefined); grade(S, "garden", "fast", 600, 100, true); assert.equal(cleanState(S).w.garden.q, 1);
});
