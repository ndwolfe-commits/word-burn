// Word Burn: the screen, the voice and the fireworks. The rules of the game live in engine.js.
import { LISTS, ALLKEYS, ROUND, fresh, day, matches, instantMs, pick, apply, grade, newRound, counts, band } from "./engine.js";

const VERSION = "game v1";
const KEY = "wb.game.v1", SETKEY = "wb.settings.v1";
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
let S = Object.assign(fresh(), store.get(KEY) || {});
let P = Object.assign({ mode: "voice", sound: true }, store.get(SETKEY) || {});
const save = () => store.set(KEY, S);

const app = document.getElementById("app");
function h(tag, a, ...kids) {
  const e = document.createElement(tag);
  if (a) for (const k in a) { const v = a[k]; if (v == null || v === false) continue; if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
  for (const c of kids.flat()) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return e;
}
function put(cls, ...kids) { app.className = cls; app.textContent = ""; for (const k of kids.flat()) if (k != null && k !== false) app.append(k); }
const wait = ms => new Promise(r => setTimeout(r, ms));
const secs = ms => (ms / 1000).toFixed(1) + "s";
const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const show = w => w.replace(/'/g, "’");

/* ---------- fireworks ---------- */
const fx = document.getElementById("fx"), g2 = fx.getContext("2d");
let parts = [], raf = 0;
function sizeFx() { const d = Math.min(2, window.devicePixelRatio || 1); fx.width = innerWidth * d; fx.height = innerHeight * d; g2.setTransform(d, 0, 0, d, 0, 0); }
sizeFx(); addEventListener("resize", sizeFx);
const HUES = [["#ffb21e", "#ffd35a", "#ff7a1a"], ["#35e0c2", "#9bfff0", "#1fb7ff"], ["#ff5a8a", "#ffc0d6", "#b9a7ff"], ["#fff3b0", "#ffb21e", "#ff5a36"]];
function burst(x, y, n, speed, hue) {
  const cols = HUES[hue % HUES.length];
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = speed * (.35 + Math.random() * .65); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, fade: .012 + Math.random() * .014, r: 1.6 + Math.random() * 2.4, c: cols[i % cols.length] }); }
  if (!raf) raf = requestAnimationFrame(tick);
}
function tick() {
  g2.clearRect(0, 0, innerWidth, innerHeight);
  for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vy += .07; p.vx *= .985; p.vy *= .985; p.life -= p.fade; g2.globalAlpha = Math.max(0, p.life); g2.fillStyle = p.c; g2.beginPath(); g2.arc(p.x, p.y, p.r, 0, 7); g2.fill(); }
  g2.globalAlpha = 1; parts = parts.filter(p => p.life > 0);
  raf = parts.length ? requestAnimationFrame(tick) : 0;
}
function fireworks(big) {
  const card = document.getElementById("card"), r = card ? card.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  burst(r.left + r.width / 2, r.top + r.height / 2, big ? 70 : 26, big ? 7 : 4, big ? 0 : 1);
  if (!big) return;
  for (let i = 0; i < 3; i++) setTimeout(() => burst(innerWidth * (.15 + Math.random() * .7), innerHeight * (.08 + Math.random() * .28), 60, 6, 1 + i), 120 + i * 150);
}

/* ---------- sound ---------- */
let actx = null;
function tone(f, at, dur, vol, type) { if (!P.sound || !actx) return; try { const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + at; o.type = type || "triangle"; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(vol || .1, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur); } catch (e) {} }
const sfx = { fast() { tone(700, 0, .08); tone(1050, .06, .1); tone(1400, .12, .16); tone(180, .1, .25, .12, "sine"); }, slow() { tone(520, 0, .1); tone(700, .08, .12); }, miss() { tone(300, 0, .16, .06, "sine"); }, done() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * .1, .2)); } };

/* ---------- ears: the microphone times the start, the phone's dictation names the word ---------- */
const ears = { stream: null, analyser: null, buf: null, rec: null, want: false, down: false, poll: 0, lvl: 0, quiet: [], quietest: Infinity, onText: null, onLevel: null, error: "" };
async function openEars() {
  ears.error = "";
  if (!SR) throw new Error("no dictation");
  const rec = ears.rec = new SR(); rec.lang = "en-GB"; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 3;
  rec.onresult = e => { const r = e.results[e.results.length - 1]; if (!r || !ears.onText) return; const texts = Array.from(r).map(a => a.transcript.trim()).filter(Boolean); if (texts.length) ears.onText(texts, r.isFinal); };
  rec.onerror = e => { ears.error = e.error || "error"; };
  rec.onend = () => { if (!ears.want) return; try { rec.start(); } catch (e) { ears.down = true; if (ears.onDown) ears.onDown(); } };
  ears.want = true; ears.down = false;
  rec.start();                                                       // must run straight from the tap
  ears.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false } });
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === "suspended") await actx.resume();
  ears.analyser = actx.createAnalyser(); ears.analyser.fftSize = 512; ears.analyser.smoothingTimeConstant = 0;
  actx.createMediaStreamSource(ears.stream).connect(ears.analyser); ears.buf = new Float32Array(512);
  ears.quiet = []; ears.quietest = Infinity;
  ears.poll = setInterval(() => {
    ears.analyser.getFloatTimeDomainData(ears.buf); let s = 0; for (let i = 0; i < 512; i++) s += ears.buf[i] * ears.buf[i];
    ears.lvl = Math.sqrt(s / 512); if (ears.onLevel) ears.onLevel(ears.lvl, performance.now());
  }, 10);
}
function closeEars() {
  ears.want = false; clearInterval(ears.poll); ears.onText = ears.onLevel = ears.onDown = null;
  try { ears.rec && ears.rec.stop(); } catch (e) {}
  try { ears.stream && ears.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
  ears.stream = ears.analyser = ears.rec = null;
}
// Wait until the room is quiet, so the last word's tail is not taken for the next word's start.
function quietRoom() {
  return new Promise(res => {
    const win = [], t0 = performance.now();
    ears.onLevel = (v, now) => {
      win.push(v); if (win.length > 30) win.shift();
      const m = median(win); if (m < ears.quietest) ears.quietest = m;
      if (now - t0 < 350) return;
      if (Math.max(...win) > Math.max(ears.quietest * 6, 0.003) && now - t0 < 2500) return;
      ears.onLevel = null; res(Math.min(m, Math.max(ears.quietest, 0.00005) * 3));
    };
  });
}
// Show-time listening for one word. Resolves {right, onset, heard} or {unheard:true}.
function listen(key, t0, floor) {
  return new Promise(res => {
    const low = Math.min(0.04, Math.max(floor * 5, 0.0015)), line = Math.min(0.08, Math.max(floor * 12, 0.004));
    let seg = 0, high = 0, onset = null, heard = "", settled = false, wrongTimer = 0;
    const end = out => { if (settled) return; settled = true; clearTimeout(giveUp); clearTimeout(wrongTimer); ears.onLevel = ears.onText = null; res(out); };
    ears.onLevel = (v, now) => {
      if (onset != null) return;
      if (now - t0 > 120 && v > low) { if (!seg) seg = now; if (v > line) { if (!high) high = now; if (now - high >= 30) { onset = seg - t0; clearTimeout(giveUp); giveUp = setTimeout(() => end(heard ? { right: false, onset, heard } : { unheard: true }), 3200); } } else high = 0; }
      else { high = 0; seg = 0; }
    };
    ears.onText = (texts, final) => {
      if (performance.now() - t0 < 250) return;                       // leftovers from the word before
      heard = texts[0]; const el = document.getElementById("heard"); if (el) el.textContent = "Heard: " + heard;
      if (texts.some(t => matches(t, key))) return end({ right: true, onset, heard });
      if (final) { clearTimeout(wrongTimer); wrongTimer = setTimeout(() => end({ right: false, onset, heard }), 500); }   // brief grace for a correction
    };
    let giveUp = setTimeout(() => end(heard ? { right: false, onset, heard } : { unheard: true }), 6000);
  });
}

/* ---------- a round ---------- */
let R = null, T = null;   // R: engine round. T: this round's tally for the screen.
const voiceMode = () => P.mode === "voice" && !!SR && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
async function startRound() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (actx && actx.state === "suspended") actx.resume().catch(() => {});
  let voice = voiceMode(), opening = null;
  if (voice) opening = openEars();                                    // straight from the tap
  R = newRound(); T = { voice, outs: [], score: 0, combo: 0, maxCombo: 0, burned: [], later: [], fastest: null, stop: false, retried: {} };
  playScreen();
  if (voice) {
    setSay("", "Getting ready to listen…");
    try { await opening; } catch (e) { closeEars(); T.voice = false; setSay("", "No microphone this time", "A grown-up can tap instead."); drawFoot(); await wait(1500); }
    if (T.voice) ears.onDown = () => { if (!R) return; sheet(h("div", null, h("h1", null, "Listening stopped"), h("button", { class: "play", onclick: () => { closeSheet(); try { ears.rec.start(); ears.down = false; } catch (e) {} } }, "Keep going"))); };
  }
  await wait(500);
  while (R && !T.stop && R.i < ROUND) {
    const card = pick(S, R); if (!card) break;
    await playCard(card);
  }
  if (R) endRound();
}
async function playCard(card) {
  const wordEl = document.getElementById("word"), cardEl = document.getElementById("card"); if (!wordEl) return;
  cardEl.className = "card"; wordEl.className = "dot"; wordEl.textContent = ""; wordEl.style.fontSize = ""; setSay("", ""); drawFoot("wait");
  let floor = 0.0003;
  if (T.voice) floor = await quietRoom(); else await wait(450);
  if (!R || T.stop) return;
  wordEl.className = ""; wordEl.textContent = show(card.key);
  wordEl.style.fontSize = Math.max(30, Math.min(112, (cardEl.clientWidth - 36) / (Math.max(3, card.key.length) * .6))) + "px";
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const t0 = performance.now(), limit = instantMs(S);
  drawFoot("go");
  let out, rt = 0, heard = "";
  if (T.voice) {
    const r = await listen(card.key, t0, floor); if (!R || T.stop) return;
    if (r.unheard) {
      if (!T.retried[card.key]) { T.retried[card.key] = 1; setSay("", "Didn’t catch that", "Say it again."); await wait(900); return playCard(card); }
      out = "miss";
    } else { heard = r.heard || ""; rt = r.onset || 0; out = !r.right ? "miss" : r.onset != null && r.onset <= limit ? "fast" : "slow"; }
  } else {
    const tap = await new Promise(res => { T.tap = res; }); if (!R || T.stop) return;
    rt = Math.max(150, performance.now() - t0 - 300); out = tap === "no" ? "miss" : rt <= limit ? "fast" : "slow";
  }
  await settle(card, out, rt, heard);
}
async function settle(card, out, rt, heard) {
  const wordEl = document.getElementById("word"), cardEl = document.getElementById("card");
  T.tap = null; drawFoot("wait");                                    // answer buttons go as soon as one is used
  const undo = { w: S.w[card.key] ? Object.assign({}, S.w[card.key]) : null, level: S.level, rt: S.rt.slice(), burned: S.burned };
  const g = apply(S, R, card, out, rt);
  T.outs.push(out); drawDots();
  if (out === "miss") { T.combo = 0; if (!T.later.includes(card.key)) T.later.push(card.key); }
  else { if (out === "fast") { T.combo++; if (rt && (!T.fastest || rt < T.fastest.rt)) T.fastest = { key: card.key, rt }; } T.maxCombo = Math.max(T.maxCombo, T.combo); T.score += out === "fast" ? 2 : 1; }
  if (g.burnedNow) T.burned.push(card.key);
  save(); drawTop();
  cardEl.classList.add(out);
  if (out === "fast") { wordEl.className = "burn"; fireworks(true); sfx.fast(); setSay("fast", T.combo >= 3 ? T.combo + " in a row!" : "Burned!", rt ? secs(rt) : ""); await wait(750); }
  else if (out === "slow") { wordEl.className = "warm"; fireworks(false); sfx.slow(); setSay("slow", "Got it", "A bit quicker next time and it burns."); await wait(800); }
  else {
    sfx.miss(); setSay("miss", "This one is “" + show(card.key) + "”", heard && !matches(heard, card.key) ? "Heard: " + heard : "It’s coming back.");
    const fixed = await new Promise(res => {
      const foot = document.getElementById("foot"); foot.textContent = "";
      foot.append(h("button", { class: "ghost", onclick: () => res(true) }, "Grown-up: that was right"));
      setTimeout(() => res(false), 2300);
    });
    if (fixed && R) {                                                  // the listener got it wrong: undo and count it as read, without the speed bonus
      if (undo.w) S.w[card.key] = undo.w; else delete S.w[card.key];
      S.level = undo.level; S.rt = undo.rt; S.burned = undo.burned;
      const g2 = grade(S, card.key, "slow", 0); if (g2.burnedNow) { S.burned++; T.burned.push(card.key); }
      T.outs[T.outs.length - 1] = "slow"; T.later = T.later.filter(k => k !== card.key); T.score++; save(); drawDots(); drawTop(); drawShelf();
      wordEl.className = "warm"; setSay("slow", "Got it", ""); await wait(500);
    } else { wordEl.className = "drop"; await wait(450); drawShelf(); await wait(250); }
  }
}
function endRound() {
  const T0 = T; closeEars(); R = null;
  const n = T0.outs.length; if (!n) return home();
  const today = new Date().toDateString(), y = new Date(Date.now() - 864e5).toDateString();
  if (S.streak.d !== today) S.streak = { d: today, n: S.streak.d === y ? S.streak.n + 1 : 1 };
  S.best.combo = Math.max(S.best.combo || 0, T0.maxCombo);
  S.rounds.push({ t: Date.now(), n, fast: T0.outs.filter(o => o === "fast").length, miss: T0.outs.filter(o => o === "miss").length, voice: T0.voice ? 1 : 0 }); S.rounds = S.rounds.slice(-60);
  save(); sfx.done();
  const sideNow = ALLKEYS.filter(k => band(S, k) === "side");
  for (let i = 0; i < 5; i++) setTimeout(() => burst(innerWidth * (.1 + Math.random() * .8), innerHeight * (.1 + Math.random() * .35), 60, 6, i), i * 180);
  put("sum",
    h("h1", null, "Round ", h("b", null, "done")),
    h("div", { class: "trio" },
      h("div", null, h("b", null, T0.burned.length), h("span", null, "new words burned")),
      h("div", null, h("b", null, T0.maxCombo), h("span", null, "best run")),
      h("div", null, h("b", null, T0.fastest ? secs(T0.fastest.rt) : "–"), h("span", null, T0.fastest ? "fastest: " + show(T0.fastest.key) : "fastest"))),
    sideNow.length ? h("div", { class: "shelf", style: "justify-content:center" }, h("span", { class: "lab" }, "Coming back"), sideNow.slice(0, 8).map(k => h("span", { class: "chip" }, show(k)))) : null,
    h("button", { class: "play", onclick: startRound }, "Again"),
    h("button", { class: "ghost", style: "max-width:240px", onclick: home }, "Done for now"));
}

/* ---------- screens ---------- */
function home() {
  const c = counts(S), total = c.burned + c.locked;
  put("home",
    h("button", { class: "icon corner", "aria-label": "For grown-ups", onclick: grownUps }, "⚙"),
    h("div", { class: "flame", "aria-hidden": "true" }, "🔥"),
    h("div", { class: "logo" }, "Word", h("b", null, "Burn")),
    h("div", { class: "tally" }, h("b", null, total), total === 1 ? "word burned" : "words burned"),
    h("button", { class: "play", id: "play", onclick: startRound }, "Play"),
    S.streak.n > 1 && (S.streak.d === new Date().toDateString() || S.streak.d === new Date(Date.now() - 864e5).toDateString()) ? h("div", { class: "muted" }, S.streak.n + " days in a row") : null);
}
function playScreen() {
  put("",
    h("div", { class: "row" }, h("button", { class: "icon", "aria-label": "Stop", onclick: () => { T.stop = true; if (T.tap) T.tap("stop"); ears.onLevel = ears.onText = null; endRound(); } }, "✕"), h("div", { class: "dots", id: "dots" }, Array.from({ length: ROUND }, () => h("i"))), h("div", { class: "count", id: "count" })),
    h("div", { class: "combo", id: "combo" }),
    h("div", { class: "stage" }, h("div", { class: "card", id: "card" }, h("span", { id: "word", class: "dot" })), h("div", { class: "say", id: "say", "aria-live": "polite" })),
    h("div", { class: "shelf", id: "shelf" }),
    h("div", { class: "foot", id: "foot" }));
  drawTop(); drawShelf();
}
function drawTop() { const c = document.getElementById("count"); if (c) { const n = counts(S); c.textContent = "🔥 " + (n.burned + n.locked); } const k = document.getElementById("combo"); if (k) k.textContent = T && T.combo >= 2 ? "🔥".repeat(Math.min(5, T.combo)) + "  " + T.combo + " in a row" : ""; }
function drawDots() { const d = document.getElementById("dots"); if (!d) return; T.outs.forEach((o, i) => { if (d.children[i]) d.children[i].className = o; }); }
function drawShelf() { const s = document.getElementById("shelf"); if (!s) return; s.textContent = ""; if (!T.later.length) return; s.append(h("span", { class: "lab" }, "Coming back"), T.later.slice(-6).map(k => h("span", { class: "chip" }, show(k)))); }
function setSay(cls, main, sub) { const s = document.getElementById("say"); if (!s) return; s.className = "say " + cls; s.textContent = main; if (sub) s.append(h("span", null, sub)); }
function drawFoot(phase) {
  const f = document.getElementById("foot"); if (!f || !T) return; f.textContent = "";
  if (T.voice) { f.append(h("div", { class: "listen" }, phase === "go" ? h("span", { class: "pulse" }) : null, h("span", { id: "heard" }, phase === "go" ? "Say it!" : " "))); return; }
  if (phase !== "go") return;
  f.append(h("div", { class: "pair" }, h("button", { class: "big no", onclick: () => T.tap && T.tap("no") }, "Not yet"), h("button", { class: "big yes", onclick: () => T.tap && T.tap("yes") }, "Got it")));
}
function sheet(inner) { closeSheet(); document.body.append(h("div", { class: "sheet" }, inner)); }
function closeSheet() { const s = document.querySelector(".sheet"); if (s) s.remove(); }
function grownUps() {
  const setP = (k, v) => () => { P[k] = v; store.set(SETKEY, P); grownUps(); };
  const opt = (k, v, label) => h("button", { "aria-pressed": String(P[k] === v), onclick: setP(k, v) }, label);
  let armed = false;
  const reset = h("button", { class: "danger", onclick: () => { if (!armed) { armed = true; reset.textContent = "Tap again to wipe all progress"; return; } S = fresh(); save(); closeSheet(); home(); } }, "Reset all progress");
  const side = ALLKEYS.filter(k => band(S, k) === "side");
  sheet(h("div", null,
    h("div", { class: "row spread" }, h("h1", null, "For grown-ups"), h("button", { class: "icon", "aria-label": "Close", onclick: () => { closeSheet(); home(); } }, "✕")),
    h("h2", null, "Progress by set"),
    LISTS.map(l => { const c = counts(S, l.words), n = l.words.length; return h("div", null, h("div", { class: "row spread small" }, h("span", null, l.name), h("span", { class: "muted" }, (c.burned + c.locked) + " of " + n + (c.side ? ", " + c.side + " coming back" : ""))), h("div", { class: "bar" }, ["locked", "burned", "side"].map(b => c[b] ? h("i", { class: b, style: "width:" + (100 * c[b] / n) + "%" }) : null))); }),
    side.length ? [h("h2", null, "Coming back (" + side.length + ")"), h("p", { class: "small" }, side.map(show).join(", "))] : null,
    h("h2", null, "How answers are checked"),
    SR ? h("div", { class: "seg" }, opt("mode", "voice", "The phone listens"), opt("mode", "tap", "A grown-up taps")) : h("p", { class: "small muted" }, "This browser has no dictation, so a grown-up taps Got it or Not yet."),
    h("h2", null, "Sounds"), h("div", { class: "seg" }, opt("sound", true, "On"), opt("sound", false, "Off")),
    h("h2", null, "How it works"),
    h("p", { class: "small" }, "A word read right and instantly burns. Instant is set from the reader’s own speed, currently within " + secs(instantMs(S)) + (S.rt.length < 6 ? " (a starting value until it has timed a few reads)" : "") + "."),
    h("p", { class: "small" }, "Right but slow, or wrong, and the word comes back every few cards until it gets three instant reads in a row. Burned words get one check a week later. It tries a harder word every third new card to find the reader’s edge."),
    h("p", { class: "small" }, "Progress is kept on this phone only for now. Nothing is sent anywhere."),
    h("p", { class: "small muted" }, VERSION + " · ", h("a", { href: "test.html" }, "microphone test")),
    reset));
}
home();
