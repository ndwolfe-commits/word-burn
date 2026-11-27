// Working out when a voice began, from sound levels. The numbers are taken from a real round on an iPhone in a noisy room.
import test from "node:test"; import assert from "node:assert/strict";
import { voiceStart } from "../public/hearing.js";

// levels every 10 ms: the room, then a voice from `from` ms for `len` ms rising to `peak`
function sound({ room, peak, from, len = 400, total = 1500, t0 = 5000 }) {
  const hist = []; let max = 0;
  for (let ms = 0; ms <= total; ms += 10) {
    const inVoice = ms >= from && ms < from + len, ramp = Math.min(1, (ms - from + 10) / 40);
    const v = inVoice ? room + (peak - room) * ramp * (0.8 + 0.2 * ((ms / 10) % 2)) : room * (0.8 + 0.4 * ((ms / 10) % 2));
    hist.push(t0 + ms, v); if (v > max) max = v;
  }
  return { hist, t0, max };
}
test("a noisy room: a voice 8 times the room is found, though the live rule (12 times) missed it", () => {
  const room = 0.0024, { hist, t0, max } = sound({ room, peak: 0.0189, from: 650 });
  assert.ok(max < room * 12, "this is a case the live rule cannot see");
  const o = voiceStart(hist, t0, room, max);
  assert.ok(o >= 640 && o <= 700, "start found at " + o);
});
test("a quiet room gives the same answer as before, near the true start", () => {
  const { hist, t0, max } = sound({ room: 0.0001, peak: 0.015, from: 700 });
  const o = voiceStart(hist, t0, 0.0001, max); assert.ok(o >= 690 && o <= 750, "start found at " + o);
});
test("no voice, only the room: nothing is made up", () => {
  const { hist, t0, max } = sound({ room: 0.002, peak: 0.002, from: 5000 });
  assert.equal(voiceStart(hist, t0, 0.002, max), null);
});
test("a sleeping meter (all zeros) gives nothing", () => {
  const hist = []; for (let ms = 0; ms < 1000; ms += 10) hist.push(ms, 0);
  assert.equal(voiceStart(hist, 0, 0, 0), null);
});
test("a click shorter than 30 ms is not a voice", () => {
  const { hist, t0 } = sound({ room: 0.001, peak: 0.001, from: 5000 });
  hist[2 * 40 + 1] = 0.03; hist[2 * 41 + 1] = 0.03;                    // 20 ms of noise at 400 ms
  assert.equal(voiceStart(hist, t0, 0.001, 0.03), null);
});
test("sound in the first 120 ms is the last word's tail, not this word", () => {
  const { hist, t0, max } = sound({ room: 0.0005, peak: 0.02, from: 0, len: 100 });
  assert.equal(voiceStart(hist, t0, 0.0005, max), null);
});
test("a slow reader is still slow: a late voice gives a late start", () => {
  const { hist, t0, max } = sound({ room: 0.002, peak: 0.018, from: 1900, total: 2600 });
  const o = voiceStart(hist, t0, 0.002, max); assert.ok(o >= 1890 && o <= 1950, "start found at " + o);
});
