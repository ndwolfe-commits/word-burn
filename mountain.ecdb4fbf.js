// Word Burn mountain: where the path goes and how the mountain is drawn. No rules of the game live here:
// it only turns a number of burned words into a place on the path.
import { LISTS, ALLKEYS } from "./engine.ecdb4fbf.js";

export const SUMMIT = ALLKEYS.length;                 // one step for every word
// A camp where each set of words ends. The last set ends at the summit, so it has no camp of its own.
export const CAMPS = (() => {
  const seen = new Set(), out = [];
  LISTS.forEach((l, i) => { for (const w of l.words) seen.add(w); if (i < LISTS.length - 1) out.push({ n: seen.size, name: "Camp " + (i + 1) }); });
  return out;
})();

export const W = 360;                                 // the drawing is 360 units wide, however wide the phone is
const GAP = 30, SLOPE = 4, TURN = 40, CLEARING = 64, SKY = 240, GROUND = 96;
const legSize = left => (left > 70 ? 10 : left > 40 ? 8 : left > 20 ? 6 : left > 8 ? 4 : Math.min(left, 3));

// The path: stone 0 is the start at the bottom, stone `summit` is the top. It zigzags up, with shorter legs near the peak
// and a wider gap above any leg that holds a camp, so the tent has room.
export function trail(summit = SUMMIT, camps = CAMPS) {
  const campAt = new Set(camps.map(c => c.n)), pts = [], legs = [];
  let i = 0, up = 0, dir = 1;
  while (i <= summit) {
    const k = legSize(summit - i + 1), half = (k - 1) * GAP / 2; let camp = false;
    legs.push({ up, half });
    for (let j = 0; j < k; j++, i++) { pts.push({ x: W / 2 + dir * (j * GAP - half), up: up + j * SLOPE }); if (campAt.has(i)) camp = true; }
    up += (k - 1) * SLOPE + TURN + (camp ? CLEARING : 0); dir = -dir;
  }
  const top = pts[summit].up, height = top + SKY + GROUND, y = u => height - GROUND - u;
  for (const p of pts) { p.y = y(p.up); delete p.up; }
  return { pts, height, summit, legs: legs.map(l => ({ y: y(l.up), half: l.half })), camps: camps.map((c, idx) => ({ ...c, idx, x: pts[c.n].x, y: pts[c.n].y })) };
}

// What a round did to the climber's place. He only ever walks up: if words were forgotten he simply stands lower next time.
export function walkPlan(from, to, summit = SUMMIT, camps = CAMPS) {
  from = Math.max(0, Math.min(summit, from | 0)); to = Math.max(0, Math.min(summit, to | 0));
  if (to <= from) return { start: to, end: to, camps: [], summit: false };
  return { start: from, end: to, camps: camps.filter(c => c.n > from && c.n <= to), summit: to === summit };
}
// What he is climbing towards from step n, and how many steps are left to it. Nothing once he is at the top.
export function nextStop(n, summit = SUMMIT, camps = CAMPS) {
  if (n >= summit) return null;
  const c = camps.find(x => x.n > n);
  return c ? { name: c.name, left: c.n - n } : { name: "the top", left: summit - n };
}
// The stones that carry a word to pick up: the next few ahead of the climber.
export function gemSteps(at, count, summit = SUMMIT) { const out = []; for (let s = at + 1; s <= summit && out.length < Math.min(count, 8); s++) out.push(s); return out; }

/* ---------- drawing ---------- */
const r1 = v => Math.round(v * 10) / 10;
function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pill = (cx, y, text, cls) => { const w = text.length * 7.4 + 18, x = Math.max(4, Math.min(W - w - 4, cx - w / 2)); return `<g class="${cls}"><rect x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="20" rx="10"/><text x="${r1(x + w / 2)}" y="${r1(y + 14.5)}" text-anchor="middle">${text}</text></g>`; };
export function gemsMarkup(T, steps) {
  return steps.map(s => { const p = T.pts[s]; return `<polygon class="gem" data-s="${s}" points="${r1(p.x)},${r1(p.y - 30)} ${r1(p.x + 7)},${r1(p.y - 21)} ${r1(p.x)},${r1(p.y - 12)} ${r1(p.x - 7)},${r1(p.y - 21)}"/>`; }).join("");
}
export const climberAt = (p, face = 1) => `translate(${r1(p.x)} ${r1(p.y)}) scale(${face} 1)`;
// The stand-in climber, drawn with his feet at 0,0 and facing right. The child will choose the real one later:
// swap this one function's drawing and nothing else changes.
const climber = () => `<circle cx="0" cy="-14" r="24" class="halo"/><rect x="-12" y="-27" width="8" height="14" rx="3" fill="#c9702a"/><rect x="-6" y="-29" width="14" height="19" rx="6" fill="#35e0c2"/><rect x="-5" y="-11" width="5" height="9" rx="2.5" fill="#14233b"/><rect x="2" y="-11" width="5" height="9" rx="2.5" fill="#14233b"/><circle cx="1" cy="-37" r="9" fill="#ffd9b0"/><path d="M-8 -39 Q1 -53 10 -39 Z" fill="#ff5a36"/><circle cx="1" cy="-49" r="3" fill="#fff"/><circle cx="5" cy="-36" r="1.3" fill="#14233b"/>`;

// The whole mountain as one picture, with the climber standing on stone `at`.
export function scene(T, at, gems = []) {
  const { pts, height: H, summit } = T, top = pts[summit], peak = { x: top.x, y: top.y - 46 }, rand = rng(707), o = [];
  // The mountain's outline: full width low down, then stepping in with the path to the peak.
  const narrow = T.legs.filter(l => l.half < 135), left = [], right = [];
  for (const l of narrow) { const hw = l.half + 62 + rand() * 14; left.push([Math.max(0, W / 2 - hw), l.y + 14]); right.push([Math.min(W, W / 2 + hw), l.y + 14]); }
  const outline = [[0, H], ...left, [peak.x - 16, peak.y + 26], [peak.x, peak.y], [peak.x + 16, peak.y + 26], ...right.reverse(), [W, H]].map(p => r1(p[0]) + "," + r1(p[1])).join(" ");
  const snowY = top.y + (H - top.y) * .3, rockY = top.y + (H - top.y) * .66;
  const wavy = (y0, a) => { let d = `M0 ${H} L0 ${y0}`; for (let x = 0; x <= W; x += 20) d += ` L${x} ${r1(y0 + (x / 20 % 2 ? a : -a))}`; return d + ` L${W} ${H} Z`; };
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${r1(H)}" role="img" aria-label="The mountain: step ${at} of ${summit}"><defs><clipPath id="mt"><polygon points="${outline}"/></clipPath></defs>`);
  for (let i = 0; i < 70; i++) o.push(`<circle cx="${r1(rand() * W)}" cy="${r1(rand() * (snowY + 500))}" r="${r1(.6 + rand())}" fill="#fff" opacity="${r1(.35 + rand() * .6)}"/>`);
  o.push(`<circle cx="62" cy="96" r="26" fill="#fff3b0"/><circle cx="72" cy="88" r="22" fill="#0b1430"/>`);
  o.push(`<g clip-path="url(#mt)"><rect width="${W}" height="${r1(H)}" fill="#4a5f9e"/><path d="${wavy(snowY, 9)}" fill="#2b3f78"/><path d="${wavy(rockY, 9)}" fill="#1a3a4c"/><rect y="${r1(H - 40)}" width="${W}" height="40" fill="#12303a"/>`);
  o.push(`<polygon points="${r1(peak.x - 60)},${r1(peak.y + 110)} ${r1(peak.x - 30)},${r1(peak.y + 78)} ${r1(peak.x - 12)},${r1(peak.y + 96)} ${r1(peak.x + 6)},${r1(peak.y + 74)} ${r1(peak.x + 30)},${r1(peak.y + 100)} ${r1(peak.x + 60)},${r1(peak.y + 84)} ${r1(peak.x + 70)},${r1(peak.y - 10)} ${r1(peak.x - 70)},${r1(peak.y - 10)}" fill="#eef3ff"/>`);
  // Trees low down, boulders in the middle, snow drifts near the top: all in the gaps between the legs of the path.
  for (const l of T.legs) {
    const y = l.y + 26, n = rand() < .75 ? 1 + (rand() < .4 ? 1 : 0) : 0;
    for (let k = 0; k < n; k++) {
      const x = 16 + rand() * (W - 32), s = .8 + rand() * .5;
      if (y > rockY + 20) o.push(`<g transform="translate(${r1(x)} ${r1(y)}) scale(${r1(s)})"><rect x="-2" y="-4" width="4" height="6" fill="#4b3a2a"/><polygon points="-10,-4 0,-22 10,-4" fill="#1f6b56"/><polygon points="-7,-14 0,-30 7,-14" fill="#2a8a6c"/></g>`);
      else if (y > snowY + 20) o.push(`<polygon transform="translate(${r1(x)} ${r1(y)}) scale(${r1(s)})" points="-12,2 -8,-8 2,-12 11,-5 13,2" fill="#3f548f"/>`);
      else o.push(`<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(16 * s)}" ry="${r1(5 * s)}" fill="#dfe8ff" opacity=".7"/>`);
    }
  }
  o.push(`</g>`);
  o.push(`<polyline points="${pts.map(p => r1(p.x) + "," + r1(p.y)).join(" ")}" fill="none" stroke="#0b1430" stroke-opacity=".28" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`);
  o.push(`<g id="stones">` + pts.map((p, i) => `<ellipse cx="${r1(p.x)}" cy="${r1(p.y)}" rx="7" ry="5" class="st${i <= at ? " on" : ""}"/>`).join("") + `</g>`);
  o.push(pill(pts[0].x, pts[0].y + 16, "Start", "sign"));
  for (const c of T.camps) {
    const lit = at >= c.n ? " lit" : "";
    o.push(`<g class="camp${lit}" data-n="${c.n}"><polygon points="${r1(c.x - 20)},${r1(c.y - 14)} ${r1(c.x)},${r1(c.y - 46)} ${r1(c.x + 20)},${r1(c.y - 14)}" class="tent"/><polygon points="${r1(c.x - 5)},${r1(c.y - 14)} ${r1(c.x)},${r1(c.y - 30)} ${r1(c.x + 5)},${r1(c.y - 14)}" fill="#14233b"/>`
      + `<rect x="${r1(c.x + 24)}" y="${r1(c.y - 17)}" width="14" height="4" rx="2" fill="#5a4330"/><path class="flame" d="M${r1(c.x + 31)} ${r1(c.y - 36)} q9 12 0 19 q-9 -7 0 -19z"/>`
      + pill(c.x, c.y - 70, c.name + " · " + c.n, "sign") + `</g>`);
  }
  o.push(`<line x1="${r1(top.x + 20)}" y1="${r1(top.y - 2)}" x2="${r1(top.x + 20)}" y2="${r1(top.y - 62)}" stroke="#eef3ff" stroke-width="2.5" stroke-linecap="round"/><polygon points="${r1(top.x + 20)},${r1(top.y - 62)} ${r1(top.x + 46)},${r1(top.y - 53)} ${r1(top.x + 20)},${r1(top.y - 44)}" fill="#ff5a36"/>`);
  o.push(pill(top.x, peak.y - 52, "Summit · " + summit, "sign top"));
  o.push(`<g id="gems">${gemsMarkup(T, gems)}</g>`);
  o.push(`<g id="climber" transform="${climberAt(pts[at])}">${climber()}</g></svg>`);
  return o.join("");
}
