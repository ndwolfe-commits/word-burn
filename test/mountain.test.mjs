// The mountain: the path, the camps and the walk. These check the picture's sums, not how it looks on a phone.
import test from "node:test"; import assert from "node:assert/strict";
import { SUMMIT, CAMPS, W, trail, walkPlan, gemSteps, nextStop, scene } from "../public/mountain.js";
import { ALLKEYS, LISTS, SCHOOL } from "../public/engine.js";

test("the summit is one step for every word, and the school sheet is counted apart", () => {
  assert.equal(SUMMIT, ALLKEYS.length); assert.equal(SUMMIT, 707); assert.equal(SCHOOL.length, 507);
});
test("there is a camp where each set of words ends, except the last, which ends at the summit", () => {
  assert.deepEqual(CAMPS.map(c => c.n), [100, 200, 300, 400, 500, 557]);
  assert.equal(CAMPS.length, LISTS.length - 1);
  assert.deepEqual(CAMPS.map(c => c.name), ["Camp 1", "Camp 2", "Camp 3", "Camp 4", "Camp 5", "Camp 6"]);
});
test("the path has a stone for the start and one for every step, all on the picture", () => {
  const T = trail();
  assert.equal(T.pts.length, SUMMIT + 1);
  for (const p of T.pts) { assert.ok(p.x >= 20 && p.x <= W - 20, "stone off the side"); assert.ok(p.y > 0 && p.y < T.height, "stone off the top or bottom"); }
});
test("every step is uphill, and no two stones sit on top of each other", () => {
  const T = trail();
  for (let i = 1; i < T.pts.length; i++) {
    assert.ok(T.pts[i].y < T.pts[i - 1].y, "step " + i + " is not higher than the one before");
    assert.ok(Math.hypot(T.pts[i].x - T.pts[i - 1].x, T.pts[i].y - T.pts[i - 1].y) >= 25);
  }
  assert.equal(Math.min(...T.pts.map(p => p.y)), T.pts[SUMMIT].y);
});
test("each camp has clear ground above it for its tent and sign", () => {
  const T = trail();
  for (const c of T.camps) for (let i = c.n + 1; i <= SUMMIT; i++) { const p = T.pts[i]; if (Math.abs(p.x - c.x) < 50) assert.ok(c.y - p.y > 90 || c.y - p.y < 10, c.name + " is crowded by stone " + i); }
});
test("the climber walks up after a round, stopping at the camps he passes", () => {
  assert.deepEqual(walkPlan(95, 103), { start: 95, end: 103, camps: [CAMPS[0]], summit: false });
  assert.deepEqual(walkPlan(100, 104).camps, []);                     // already at the camp: no second party
  assert.deepEqual(walkPlan(190, 305).camps.map(c => c.n), [200, 300]);
  assert.equal(walkPlan(700, 707).summit, true);
});
test("he never walks down: after forgotten words he just stands lower", () => {
  assert.deepEqual(walkPlan(120, 118), { start: 118, end: 118, camps: [], summit: false });
  assert.deepEqual(walkPlan(50, 50), { start: 50, end: 50, camps: [], summit: false });
  assert.equal(walkPlan(-5, 9999).end, SUMMIT);
});
test("words to pick up sit on the next stones ahead, at most eight, never past the summit", () => {
  assert.deepEqual(gemSteps(10, 3), [11, 12, 13]);
  assert.equal(gemSteps(10, 30).length, 8);
  assert.deepEqual(gemSteps(706, 5), [707]); assert.deepEqual(gemSteps(707, 5), []); assert.deepEqual(gemSteps(0, 0), []);
});
test("the drawing has every stone, lights the ones climbed, and lights only the camps reached", () => {
  const T = trail(), svg = scene(T, 212, gemSteps(212, 3));
  assert.equal((svg.match(/class="st/g) || []).length, SUMMIT + 1);
  assert.equal((svg.match(/class="st on"/g) || []).length, 213);
  assert.equal((svg.match(/class="camp lit"/g) || []).length, 2);
  assert.equal((svg.match(/class="camp"/g) || []).length, 4);
  assert.equal((svg.match(/class="gem"/g) || []).length, 3);
  assert.ok(svg.includes("Summit · 707") && svg.includes("Camp 6 · 557"));
  assert.ok(!/NaN|undefined/.test(svg));
});
test("the small map counts down to the next camp, then to the top", () => {
  assert.deepEqual(nextStop(0), { name: "Camp 1", left: 100 });
  assert.deepEqual(nextStop(99), { name: "Camp 1", left: 1 });
  assert.deepEqual(nextStop(100), { name: "Camp 2", left: 100 });      // standing at a camp: the next one is the target
  assert.deepEqual(nextStop(557), { name: "the top", left: 150 });
  assert.deepEqual(nextStop(706), { name: "the top", left: 1 });
  assert.equal(nextStop(707), null);
});
