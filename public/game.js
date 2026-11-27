// Word Burn: the screen, the voice and the fireworks. The rules of the game live in engine.js.
import { LISTS, SCHOOL, ALLKEYS, ROUND, fresh, matches, hears, learn, instantMs, pick, apply, newRound, counts, band, mergeState, cleanState } from "./engine.js";
import { SUMMIT, W as MW, nextStop, trail, scene, walkPlan, gemSteps, gemsMarkup, climberAt } from "./mountain.js";

const BUILD = "dev";
const SHORT = "v18";
const VERSION = "game " + SHORT + " (" + BUILD + ")";
const OLDKEY = "wb.game.v1", SETKEY = "wb.settings.v1", DEVKEY = "wb.device.v2", stateKey = id => "wb.state." + id;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
// Inside the iPhone app the listening and speaking are done by the app itself; this page only receives sound levels and heard texts.
const NATIVE = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ears);
const tell = m => { try { window.webkit.messageHandlers.ears.postMessage(m); } catch (e) {} };
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
let P = Object.assign({ mode: "voice", sound: true }, store.get(SETKEY) || {});
// This phone's players, who is playing now, and the family code if it has joined one.
let D = Object.assign({ players: [], active: null, family: null }, store.get(DEVKEY) || {});
let S = fresh();
const saveDevice = () => store.set(DEVKEY, D);
const me = () => D.players.find(p => p.id === D.active) || null;
const loadState = id => cleanState(store.get(stateKey(id))) || fresh();
const save = () => { S.updated = Date.now(); if (D.active) store.set(stateKey(D.active), S); };
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), x => "abcdefghijklmnopqrstuvwxyz0123456789"[x % 36]).join("");
const cleanName = n => String(n || "").replace(/[\u0000-\u001f<>&"'`\\]/g, "").trim().slice(0, 20);
function choose(id) { D.active = id; saveDevice(); S = loadState(id); }
function addPlayer(name) {
  const p = { id: newId(), name }; D.players.push(p); D.active = p.id; saveDevice();
  const old = D.players.length === 1 ? cleanState(store.get(OLDKEY)) : null;      // progress from before players existed goes to the first one
  S = old || fresh(); save(); return p;
}
if (D.active && me()) S = loadState(D.active); else D.active = null;

/* ---------- family sync: the same player on any phone ---------- */
const net = { ok: null, busy: false, note: "" };
async function call(method, path, body) {
  const r = await fetch("api/" + path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const data = (r.headers.get("content-type") || "").includes("json") ? await r.json() : null;
  if (!r.ok || !data) throw new Error((data && data.error) || "The family store did not answer.");
  return data;
}
async function checkNet() { try { net.ok = !!(await call("GET", "health")).ok; } catch (e) { net.ok = false; } return net.ok; }
function takePlayers(list) { for (const p of list || []) { const mine = D.players.find(x => x.id === p.id); if (mine) mine.name = p.name; else D.players.push({ id: p.id, name: p.name }); } saveDevice(); }
// Send this player's progress up and take back the joined result. Quietly does nothing when there is no family.
async function sync() {
  const p = me(); if (!D.family || !p || net.busy || net.ok === false) return false;
  net.busy = true;
  try {
    const sent = D.active, r = await call("PUT", "family/" + D.family + "/players/" + p.id, { name: p.name, state: S });
    takePlayers(r.players);
    const joined = cleanState(r.state);
    if (joined && D.active === sent && !R) { S = cleanState(mergeState(S, joined)) || S; store.set(stateKey(sent), S); }
    net.note = "Saved to the family a moment ago."; return true;
  } catch (e) { net.note = "Could not reach the family store: " + e.message; return false; }
  finally { net.busy = false; }
}
async function pullFamily() { if (!D.family) return; try { takePlayers((await call("GET", "family/" + D.family)).players); } catch (e) {} }

// A plain record of the last game: what was shown, what the phone heard, and anything the microphone or dictation did.
const DBG = []; let dbg0 = performance.now();
function dbg(what, data) { DBG.push(Math.round(performance.now() - dbg0) + " " + what + (data === undefined ? "" : " " + (typeof data === "string" ? data : JSON.stringify(data)))); if (DBG.length > 500) DBG.shift(); }
const saveDbg = () => store.set("wb.debug", DBG);
const standalone = () => window.navigator.standalone === true || (window.matchMedia && matchMedia("(display-mode: standalone)").matches);

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

/* ---------- saying a word aloud ---------- */
const canSay = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
function say(text, quiet) {
  if (NATIVE) return quiet ? Promise.resolve(true) : new Promise(res => {
    let done = false; const end = ok => { if (!done) { done = true; ears.said = null; dbg("spoke", ok ? "ok" : "no end signal"); res(ok); } };
    ears.said = () => end(true); tell({ cmd: "say", text }); setTimeout(() => end(false), 3000);
  });
  return new Promise(res => {
    if (!canSay) return res(false);
    try {
      const u = new SpeechSynthesisUtterance(text); u.lang = "en-GB"; u.rate = .85; if (quiet) u.volume = 0;
      let done = false; const end = ok => { if (!done) { done = true; if (!quiet) dbg("spoke", ok ? "ok" : "no end signal"); res(ok); } };
      u.onend = () => end(true); u.onerror = () => end(false);
      speechSynthesis.cancel(); speechSynthesis.speak(u); setTimeout(() => end(false), 3000);
    } catch (e) { res(false); }
  });
}

/* ---------- ears: the microphone times the start, the phone's dictation names the word ---------- */
const ears = { stream: null, analyser: null, buf: null, rec: null, want: false, down: false, poll: 0, lvl: 0, quiet: [], quietest: Infinity, onText: null, onLevel: null, error: "", stale: null, lastRaw: [], lastFinal: true, live: false, ignoreUntil: 0, peak: 0 };
if (NATIVE) window.__ears = {
  levels(list) { for (const [v, wall] of list) { ears.lvl = v; if (v > ears.peak) ears.peak = v; if (ears.onLevel) ears.onLevel(v, wall - performance.timeOrigin); } },
  text(texts, final) { dbg(final ? "TEXT" : "text", texts); if (ears.onText) ears.onText(texts, !!final); },
  state(s) { dbg("app ears: " + s); ears.live = s === "on"; if (ears.opened) ears.opened(s); },
  said() { if (ears.said) ears.said(); }
};
function startRec() {
  const rec = ears.rec = new SR(); rec.lang = "en-GB"; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 3;
  rec.onstart = () => { ears.live = true; dbg("dictation on"); };
  rec.onresult = e => {
    const r = e.results[e.results.length - 1]; if (!r) return;
    let texts = Array.from(r).map(a => a.transcript.trim()).filter(Boolean); if (!texts.length) return;
    const raw = texts.slice();
    if (performance.now() < ears.ignoreUntil) { dbg("text ignored", raw); return; }
    dbg(r.isFinal ? "TEXT" : "text", raw);
    if (ears.onText) ears.onText(texts, r.isFinal);
  };
  rec.onerror = e => { ears.error = e.error || "error"; dbg("dictation error", ears.error); };
  rec.onend = () => {
    ears.live = false; dbg("dictation ended");
    if (!ears.want || rec !== ears.rec) return;
    try { rec.start(); dbg("dictation restart asked"); } catch (e) { dbg("dictation restart refused", String(e.name || e)); ears.down = true; if (ears.onDown) ears.onDown(); }
  };
  rec.start();
}
// From a tap, after the phone has spoken a word. Speaking cuts the microphone and dictation off on an iPhone,
// so start dictation afresh, wake the audio, and reopen the microphone if it has not come back.
async function recoverEars() {
  if (NATIVE) return true;                                           // the app keeps one audio channel; speaking does not cut it
  const tr0 = ears.stream && ears.stream.getAudioTracks()[0];
  dbg("recovering after speaking", { audio: actx && actx.state, micMuted: tr0 ? tr0.muted : null, mic: tr0 ? tr0.readyState : null, dictationOn: ears.live });
  ears.ignoreUntil = performance.now() + 300; ears.down = false; ears.error = "";
  try { ears.rec.onend = null; if (ears.rec.abort) ears.rec.abort(); else ears.rec.stop(); } catch (e) {}
  try { startRec(); } catch (e) { dbg("dictation would not restart", String(e.name || e)); }          // straight from the tap
  try { if (actx.state !== "running") await actx.resume(); } catch (e) { dbg("audio would not resume", String(e.name || e)); }
  let tr = ears.stream && ears.stream.getAudioTracks()[0];
  if (tr && tr.muted) await Promise.race([new Promise(r => tr.addEventListener("unmute", r, { once: true })), wait(700)]);
  if (!tr || tr.muted || tr.readyState !== "live") {
    dbg("microphone still cut off; opening it again");
    try { ears.stream && ears.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
    try { await wireMic(); } catch (e) { dbg("microphone would not reopen", String(e.name || e)); return false; }
  }
  tr = ears.stream.getAudioTracks()[0];
  dbg("recovered", { audio: actx.state, micMuted: tr.muted, mic: tr.readyState });
  return true;
}
async function wireMic() {
  ears.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false } });
  const tr = ears.stream.getAudioTracks()[0];
  if (tr) { tr.onmute = () => dbg("microphone muted"); tr.onunmute = () => dbg("microphone back"); tr.onended = () => dbg("microphone ended"); }
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state !== "running") await actx.resume();
  actx.onstatechange = () => { dbg("audio " + actx.state); if (ears.want && actx.state !== "running") actx.resume().catch(() => {}); };
  ears.analyser = actx.createAnalyser(); ears.analyser.fftSize = 512; ears.analyser.smoothingTimeConstant = 0;
  actx.createMediaStreamSource(ears.stream).connect(ears.analyser); ears.buf = new Float32Array(512);
}
// The game times the voice with a sound meter that is separate from the phone's dictation. A phone can put the meter to sleep
// (often at the start of a second round) while dictation carries on. Then every word is heard but none can be timed, and
// every read would wrongly count as too slow. So before each word: check the meter is awake, wake it, or ask for a tap.
const meterAwake = () => { if (NATIVE) return true; const tr = ears.stream && ears.stream.getAudioTracks()[0]; return !!(actx && actx.state === "running" && tr && tr.readyState === "live" && !tr.muted); };
async function wakeMeter() {
  if (meterAwake()) return true;
  dbg("sound meter asleep", { audio: actx && actx.state });
  try { await Promise.race([actx.resume(), wait(500)]); } catch (e) {}
  if (!meterAwake()) await wait(400);                                // a microphone the phone muted for a moment usually comes back by itself
  if (meterAwake()) { dbg("sound meter woken"); return true; }
  dbg("asked for a tap to wake the sound meter");
  await new Promise(res => sheet(h("div", null, h("h1", null, "Listening stopped"), h("button", { class: "play", onclick: () => { closeSheet(); recoverEars().then(res, res); } }, "Keep going"))));
  dbg(meterAwake() ? "sound meter woken by a tap" : "sound meter would not wake");
  return meterAwake();
}
async function openEars() {
  ears.error = ""; ears.live = false; ears.ignoreUntil = 0;
  if (NATIVE) {
    ears.want = true; ears.down = false; ears.quiet = []; ears.quietest = Infinity;
    await new Promise((res, rej) => { ears.opened = st => { ears.opened = null; st === "on" ? res() : rej(new Error(st)); }; tell({ cmd: "open" }); setTimeout(() => rej(new Error("no answer from the app")), 15000); });
    return;
  }
  if (!SR) throw new Error("no dictation");
  ears.want = true; ears.down = false;
  startRec();                                                        // must run straight from the tap
  await wireMic();
  ears.quiet = []; ears.quietest = Infinity;
  clearInterval(ears.poll);
  ears.poll = setInterval(() => {
    if (!ears.analyser) return;
    ears.analyser.getFloatTimeDomainData(ears.buf); let s = 0; for (let i = 0; i < 512; i++) s += ears.buf[i] * ears.buf[i];
    ears.lvl = Math.sqrt(s / 512); if (ears.lvl > ears.peak) ears.peak = ears.lvl; if (ears.onLevel) ears.onLevel(ears.lvl, performance.now());
  }, 10);
}
function closeEars() {
  if (NATIVE) tell({ cmd: "close" });
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
function listen(key, t0, floor, limitMs = 6000) {
  return new Promise(res => {
    const low = Math.min(0.04, Math.max(floor * 5, 0.0015)), line = Math.min(0.08, Math.max(floor * 12, 0.004));
    let seg = 0, high = 0, onset = null, heard = "", settled = false, wrongTimer = 0; ears.peak = 0;
    if (NATIVE) tell({ cmd: "word", key });                          // a fresh recogniser for each word, told which word to expect
    const end = out => {
      if (settled) return; settled = true; clearTimeout(giveUp); clearTimeout(wrongTimer); ears.onLevel = ears.onText = null;
      dbg("result", Object.assign({ peak: +ears.peak.toFixed(4), dictationOn: ears.live }, out));
      res(out);
    };
    ears.onLevel = (v, now) => {
      if (onset != null) return;
      if (now - t0 > 120 && v > low) { if (!seg) seg = now; if (v > line) { if (!high) high = now; if (now - high >= 30) { onset = seg - t0; dbg("voice started", Math.round(onset)); clearTimeout(giveUp); giveUp = setTimeout(() => end(heard ? { right: false, onset, heard } : { unheard: true }), 3200); } } else high = 0; }
      else { high = 0; seg = 0; }
    };
    // Dictation keeps settling earlier words after the game has moved on, sometimes rewriting them into one phrase.
    // So a text counts for this word only if it names the word, or arrives after this word's voice has started.
    ears.onText = (texts, final) => {
      const now = performance.now(), how = texts.map(t => hears(S, t, key)).find(Boolean), named = !!how;
      if (named && now - t0 > 250) { heard = texts[0]; show1(heard); return end({ right: true, onset, heard, how }); }
      if (onset == null || now < t0 + onset + 200) { dbg("that text came before this word was spoken; ignored"); return; }
      heard = texts[0]; show1(heard);
      if (final) { clearTimeout(wrongTimer); wrongTimer = setTimeout(() => end({ right: false, onset, heard }), 1200); }   // time for the right word to follow
    };
    const show1 = t => { const el = document.getElementById("heard"); if (el) el.textContent = "Heard: " + t; };
    let giveUp = setTimeout(() => end(heard ? { right: false, onset, heard } : { unheard: true }), limitMs);
  });
}

/* ---------- a round ---------- */
let R = null, T = null;   // R: engine round. T: this round's tally for the screen.
const voiceMode = () => P.mode === "voice" && (NATIVE || (!!SR && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)));
async function startRound() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (actx && actx.state === "suspended") actx.resume().catch(() => {});
  let voice = voiceMode(), opening = null;
  if (voice) opening = openEars();                                    // straight from the tap
  say(" ", true);                                                     // phones only let a page speak later if it first speaks from a tap
  { const last = store.get("wb.debug"), old = store.get("wb.debug.old") || []; if (last && last.length) { old.push(last); store.set("wb.debug.old", old.slice(-4)); } }   // keep the four games before this one too
  DBG.length = 0; dbg0 = performance.now(); dbg("game", { version: VERSION, voice, homeScreen: standalone(), instant: instantMs(S), level: S.level, device: navigator.userAgent });
  R = newRound(); T = { voice, outs: [], score: 0, combo: 0, maxCombo: 0, burned: [], later: [], fastest: null, stop: false, retried: {}, from: stepsNow(), sideBefore: sideWords() };
  playScreen();
  if (voice) {
    setSay("", "Getting ready to listen…");
    try { await opening; } catch (e) { dbg("could not open ears", String((e && e.name) || e)); closeEars(); T.voice = false; setSay("", "No microphone this time", "A grown-up can tap instead."); drawFoot(); await wait(1500); }
    if (T.voice) ears.onDown = () => { if (!R || document.querySelector(".sheet")) return; dbg("asked for a tap to keep listening"); sheet(h("div", null, h("h1", null, "Listening stopped"), h("button", { class: "play", onclick: () => { closeSheet(); recoverEars(); } }, "Keep going"))); };
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
  if (T.voice && !(await wakeMeter())) { if (!R || T.stop) return; await tapInstead(); }
  if (!R || T.stop) return;
  if (T.voice) floor = await quietRoom(); else await wait(450);
  if (!R || T.stop) return;
  wordEl.className = ""; wordEl.textContent = show(card.key);
  wordEl.style.fontSize = Math.max(30, Math.min(112, (cardEl.clientWidth - 36) / (Math.max(3, card.key.length) * .6))) + "px";
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const t0 = performance.now(), limit = instantMs(S);
  dbg("SHOW " + card.key, { kind: card.kind, instant: limit, room: +floor.toFixed(4) });
  drawFoot("go");
  let out, rt = 0, heard = "", soft = false;
  if (T.voice) {
    const r = await listen(card.key, t0, floor); if (!R || T.stop) return;
    if (!NATIVE && !r.unheard && r.onset == null && ears.peak === 0) {    // heard by dictation, but the meter gave no sound at all: it was asleep, so the read was not timed
      dbg("not timed: the sound meter was asleep"); T.asleep = (T.asleep | 0) + 1;
      if (T.asleep > 2) await tapInstead(); else { setSay("", "One more time", "The microphone dozed off."); await wait(900); }
      if (!R || T.stop) return;
      return playCard(card);
    }
    if (r.unheard) {
      if (!T.retried[card.key]) { T.retried[card.key] = 1; setSay("", "Didn’t catch that", "Say it again."); await wait(900); return playCard(card); }
      out = "miss";
    } else { soft = r.how === "close"; heard = r.heard || ""; rt = r.onset || 0; out = !r.right ? "miss" : r.onset != null && r.onset <= limit ? "fast" : "slow"; }
  } else {
    const tap = await new Promise(res => { T.tap = res; }); if (!R || T.stop) return;
    rt = Math.max(150, performance.now() - t0 - 300); out = tap === "no" ? "miss" : rt <= limit ? "fast" : "slow";
  }
  await settle(card, out, rt, heard, soft);
}
// Give up on listening for the rest of this round, the same way as when the microphone will not open.
async function tapInstead() { dbg("switched to tapping for this round"); closeEars(); T.voice = false; setSay("", "No microphone this time", "A grown-up can tap instead."); drawFoot(); await wait(1500); }
async function settle(card, out, rt, heard, soft) {
  const wordEl = document.getElementById("word"), cardEl = document.getElementById("card");
  T.tap = null; drawFoot("wait");                                    // answer buttons go as soon as one is used
  const limit = instantMs(S), g = apply(S, R, card, out, rt, undefined, !!soft);
  if (soft && heard) learn(S, card.key, heard);                       // the same near miss heard again later becomes this reader's own way of saying it
  dbg("OUTCOME " + card.key, { out, ms: Math.round(rt), heard, soft: !!soft }); saveDbg();
  T.outs.push(out); drawDots();
  if (out === "miss") { T.combo = 0; if (heard) { S.log.push({ t: Date.now(), k: card.key, heard: String(heard).slice(0, 40) }); S.log = S.log.slice(-30); } }
  else { if (out === "fast") { T.combo++; if (rt && (!T.fastest || rt < T.fastest.rt)) T.fastest = { key: card.key, rt }; } else T.combo = 0; T.maxCombo = Math.max(T.maxCombo, T.combo); }
  if (g.burnedNow) T.burned.push(card.key);
  save(); drawTop();
  cardEl.classList.add(out);
  if (out === "fast") {                                               // 1. right and instant: it burns
    wordEl.className = "burn"; fireworks(true); sfx.fast(); setSay("fast", T.combo >= 3 ? T.combo + " in a row!" : "Burned!", rt ? secs(rt) : ""); await wait(750);
  } else if (out === "slow") {                                        // 2. right, but not instant: it smoulders and comes back
    wordEl.className = "ember"; sfx.slow(); setSay("slow", "Right! But too slow to burn", rt ? "You took " + secs(rt) + ". Under " + secs(limit) + " and it burns." : "Say it the moment you see it."); await wait(1500); drawShelf();
  } else {                                                            // 3. a miss: show it, say it, and wait for a tap
    ears.onText = ears.onLevel = null;
    sfx.miss(); setSay("miss", "This word is “" + show(card.key) + "”", ""); await wait(250);
    const spoke = say(card.key);
    // The reader says the word back. Saying it after a miss, not just hearing it, is what the drill studies found makes it stick.
    const echo = async () => {
      if (!T.voice || !R || T.stop) return;
      setSay("miss", "Your turn. Say “" + show(card.key) + "”", "");
      const floor = await quietRoom(); if (!R || T.stop) return;
      const r = await listen(card.key, performance.now(), floor, 5000); if (!R || T.stop) return;
      dbg("said back " + card.key, { right: !!r.right, heard: r.heard || "" }); saveDbg();
      if (r.right) { sfx.slow(); setSay("slow", "That’s it!", ""); await wait(600); }
      else if (r.heard) { learn(S, card.key, r.heard); save(); }           // heard something else twice for this word: that is how this reader says it
    };
    if (NATIVE && T.voice) { await spoke; await wait(150); await echo(); }
    else {
      await new Promise(res => {
        const foot = document.getElementById("foot"); foot.textContent = "";
        const go = () => {
          if (!T.tap) return; T.tap = null; try { speechSynthesis.cancel(); } catch (e) {}
          if (T.voice && R && !T.stop) { foot.textContent = ""; recoverEars().then(res, res); } else res();
        };
        T.tap = go;
        foot.append(h("button", { class: "next", onclick: go }, T.voice ? "Now you say it" : "Next"), canSay ? h("button", { class: "again", onclick: () => say(card.key) }, "Hear it again") : null);
      });
      if (!R || T.stop) return;
      document.getElementById("foot").textContent = "";
      await echo();
    }
    if (!R || T.stop) return;
    wordEl.className = "drop"; await wait(450); drawShelf(); await wait(200);
  }
}
function endRound() {
  const T0 = T; dbg("round over"); saveDbg(); closeEars(); R = null;
  const n = T0.outs.length; if (!n) return home();
  const today = new Date().toDateString(), y = new Date(Date.now() - 864e5).toDateString();
  if (S.streak.d !== today) S.streak = { d: today, n: S.streak.d === y ? S.streak.n + 1 : 1 };
  S.best.combo = Math.max(S.best.combo || 0, T0.maxCombo);
  S.rounds.push({ t: Date.now(), n, fast: T0.outs.filter(o => o === "fast").length, miss: T0.outs.filter(o => o === "miss").length, voice: T0.voice ? 1 : 0 }); S.rounds = S.rounds.slice(-60);
  save(); sfx.done();
  const sideNow = ALLKEYS.filter(k => band(S, k) === "side");
  for (let i = 0; i < 5; i++) setTimeout(() => burst(innerWidth * (.1 + Math.random() * .8), innerHeight * (.1 + Math.random() * .35), 60, 6, i), i * 180);
  sync().then(ok => { const n2 = document.getElementById("saved"); if (n2 && D.family) n2.textContent = ok ? "Saved to the family." : "Saved on this phone. It will reach the family next time."; });
  const to = stepsNow(), plan = walkPlan(T0.from, to), walking = plan.end > plan.start;
  const picked = walking ? Math.min(plan.end - plan.start, T0.sideBefore.filter(k => band(S, k) !== "side").length) : 0;
  const m = mountain(plan.start, walking ? picked : sideNow.length);
  put("mtn",
    h("div", { class: "row spread" }, h("div", { class: "done" }, "Round ", h("b", null, "done")), numbersLine(plan.start)),
    m.wrap,
    h("div", { class: "trio" },
      h("div", null, h("b", null, T0.burned.length), h("span", null, "new words burned")),
      h("div", null, h("b", null, T0.maxCombo), h("span", null, "best run")),
      h("div", null, h("b", null, T0.fastest ? secs(T0.fastest.rt) : "–"), h("span", null, T0.fastest ? "fastest: " + show(T0.fastest.key) : "fastest"))),
    sideNow.length ? h("div", { class: "shelf", style: "justify-content:center" }, h("span", { class: "lab" }, "To pick up next climb"), sideNow.slice(0, 8).map(k => h("span", { class: "chip" }, show(k)))) : null,
    h("div", { class: "row" }, h("button", { class: "ghost", style: "width:auto;flex:none", onclick: home }, "Done"), h("button", { class: "play", style: "flex:1", onclick: startRound }, "Again")),
    h("div", { class: "muted small", id: "saved", style: "text-align:center;min-height:0" }));
  m.show(plan.start);
  if (walking) wait(700).then(() => m.walk(plan, picked)).then(ok => { if (ok) { m.gems(plan.end, sideNow.length); const n = document.getElementById("nsteps"); if (n) n.textContent = plan.end; } });
}

/* ---------- the mountain ---------- */
// One step for every burned word. The path, camps and drawing are in mountain.js; this part puts it on the screen and walks the climber.
const TRAIL = trail();
function stepsNow() { const c = counts(S); return Math.min(SUMMIT, c.burned + c.locked); }
function sideWords() { return ALLKEYS.filter(k => band(S, k) === "side"); }
function schoolNow() { const c = counts(S, SCHOOL); return c.burned + c.locked; }
function numbersLine(steps) { return h("div", { class: "nums" }, h("span", null, "🔥 ", h("b", { id: "nsteps" }, steps), " of " + SUMMIT), h("span", { class: "sch" }, "School ", h("b", null, schoolNow()), " of " + SCHOOL.length)); }
function mountain(at, gemCount) {
  const box = h("div", { class: "mtn-scroll", id: "mtn" }), banner = h("div", { class: "mtn-banner", "aria-live": "polite" }), map = h("div", { class: "mtn-map", "aria-hidden": "true" });
  const wrap = h("div", { class: "mtn-wrap" }, box, map, banner);
  box.innerHTML = scene(TRAIL, at, gemSteps(at, gemCount));
  const svg = box.firstElementChild, who = svg.querySelector("#climber"), stones = svg.querySelector("#stones").children, gemBox = svg.querySelector("#gems");
  const scale = () => (svg.clientWidth || MW) / MW;
  const fit = () => { svg.style.height = Math.round(scale() * TRAIL.height) + "px"; };
  const look = y => { box.scrollTop = y * scale() - box.clientHeight * .6; };
  // The small map: the whole mountain filled up to where he is, and how far it is to the next camp. One round is too small
  // to see on a picture this size, so the count underneath is what moves every step.
  const mark = n => {
    const y = (38 - 30 * n / SUMMIT).toFixed(1), stop = nextStop(n);
    map.innerHTML = '<svg viewBox="0 0 44 44"><defs><clipPath id="mm"><polygon points="4,40 22,6 40,40"/></clipPath></defs><polygon points="4,40 22,6 40,40" fill="#2b3f78"/><rect clip-path="url(#mm)" x="0" y="' + y + '" width="44" height="44" fill="#ffb21e" opacity=".55"/><polygon points="22,6 17,15.5 27,15.5" fill="#eef3ff"/><polygon points="4,40 22,6 40,40" fill="none" stroke="#a3b3d6" stroke-width="1.5" stroke-linejoin="round"/><circle cx="22" cy="' + y + '" r="4" fill="#ffb21e" stroke="#0d1830" stroke-width="1.5"/></svg>';
    map.append(h("div", null, stop ? h("b", null, stop.left) : "At the top!", stop ? " to " + stop.name : null));
  };
  const say1 = text => { banner.textContent = text; banner.classList.remove("go"); void banner.offsetWidth; banner.classList.add("go"); };
  const here = n => { const r = svg.getBoundingClientRect(), k = scale(), p = TRAIL.pts[n]; return [r.left + p.x * k, r.top + p.y * k]; };
  const onResize = () => { if (!box.isConnected) return removeEventListener("resize", onResize); fit(); };
  addEventListener("resize", onResize);
  let face = 1;
  const hop = (a, b, ms) => new Promise(res => {
    if (b.x !== a.x) face = b.x < a.x ? -1 : 1;
    const t0 = performance.now(), f = now => {
      const t = Math.min(1, (now - t0) / ms), y = a.y + (b.y - a.y) * t;
      who.setAttribute("transform", climberAt({ x: a.x + (b.x - a.x) * t, y: y - Math.sin(Math.PI * t) * 9 }, face)); look(y);
      t < 1 ? requestAnimationFrame(f) : res();
    };
    requestAnimationFrame(f);
  });
  return {
    wrap,
    show(n) { fit(); look(TRAIL.pts[n].y); mark(n); },
    gems(n, count) { gemBox.innerHTML = gemsMarkup(TRAIL, gemSteps(n, count)); },
    // Walk up from plan.start to plan.end, lighting each stone, picking up the first `picked` gems, and stopping to cheer at a camp.
    // Resolves false if the screen was left part-way.
    async walk(plan, picked) {
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches, n = plan.end - plan.start, ms = Math.max(70, Math.min(260, 4500 / n));
      for (let i = plan.start; i < plan.end; i++) {
        if (!box.isConnected) return false;
        if (still) { who.setAttribute("transform", climberAt(TRAIL.pts[i + 1])); look(TRAIL.pts[i + 1].y); } else await hop(TRAIL.pts[i], TRAIL.pts[i + 1], ms);
        stones[i + 1].classList.add("on"); mark(i + 1); tone(520 + ((i - plan.start) % 8) * 40, 0, .06, .04);
        const gem = gemBox.querySelector('[data-s="' + (i + 1) + '"]');
        if (gem) { gem.classList.add("pop"); tone(1320, 0, .12, .07); tone(1760, .07, .16, .06); }
        const camp = plan.camps.find(c => c.n === i + 1), topped = plan.summit && i + 1 === plan.end;
        if (camp || topped) {
          if (camp) { const g = svg.querySelector('.camp[data-n="' + camp.n + '"]'); if (g) g.classList.add("lit"); }
          say1(topped ? "The summit!" : camp.name + "!"); sfx.done(); mark(i + 1);
          const [x, y] = here(i + 1); for (let k = 0; k < (topped ? 6 : 3); k++) setTimeout(() => burst(x + (Math.random() - .5) * 160, y - 40 - Math.random() * 120, 60, 6, k), k * 170);
          await wait(topped ? 1800 : 1100);
        }
      }
      if (!box.isConnected) return false;
      who.setAttribute("transform", climberAt(TRAIL.pts[plan.end], face)); mark(plan.end); return true;
    }
  };
}

/* ---------- screens ---------- */
function home() {
  const p = me(); if (!p) return who();
  const at = stepsNow(), side = sideWords(), m = mountain(at, side.length);
  const streak = S.streak.n > 1 && (S.streak.d === new Date().toDateString() || S.streak.d === new Date(Date.now() - 864e5).toDateString()) ? S.streak.n + " days in a row · " : "";
  put("mtn",
    h("div", { class: "row spread" }, h("button", { class: "name", onclick: who }, p.name, h("span", null, "  change")), h("div", { class: "brand" }, "Word ", h("b", null, "Burn")), h("button", { class: "icon", "aria-label": "Settings", onclick: grownUps }, "⚙")),
    m.wrap,
    side.length ? h("div", { class: "pickup" }, "💎 " + side.length + (side.length === 1 ? " word" : " words") + " to pick up on the next climb") : null,
    h("div", { class: "tiles" },
      h("div", null, h("b", { id: "tally" }, at), h("span", null, at === 1 ? "step of " + SUMMIT : "steps of " + SUMMIT)),
      h("div", { class: "sch" }, h("b", null, schoolNow()), h("span", null, "school sheet, of " + SCHOOL.length))),
    h("button", { class: "play", id: "play", onclick: startRound }, "Play"),
    h("div", { class: "muted small", style: "text-align:center" }, streak + SHORT));
  m.show(at);
  if (D.family) sync().then(ok => { if (ok && app.className === "mtn" && document.getElementById("play") && !document.querySelector(".sheet") && stepsNow() !== at) home(); });
}
function who() {
  const input = h("input", { id: "newname", type: "text", maxlength: "20", placeholder: "Your name", autocomplete: "off", autocapitalize: "words", enterkeyhint: "done" });
  const add = () => { const n = cleanName(input.value); if (!n) { input.focus(); return; } addPlayer(n); sync(); home(); };
  input.addEventListener("keydown", e => { if (e.key === "Enter") add(); });
  put("home",
    h("button", { class: "icon corner", "aria-label": "Settings", onclick: grownUps }, "⚙"),
    h("div", { class: "logo", style: "font-size:40px" }, "Who’s", h("b", null, "playing?")),
    h("div", { class: "names" }, D.players.map(p => h("button", { class: "pick", onclick: () => { choose(p.id); home(); } }, p.name))),
    h("div", { class: "newp" }, input, h("button", { class: "ghost", style: "width:auto", onclick: add }, D.players.length ? "Add" : "Start")),
    D.family ? null : h("p", { class: "muted small", style: "max-width:300px" }, "Already playing on another phone? Open Settings there for the family code, then join it from Settings here."),
    h("div", { class: "ver" }, SHORT));
  pullFamily().then(() => { if (app.className === "home" && document.getElementById("newname") && !document.getElementById("newname").value && !document.querySelector(".sheet")) { const names = document.querySelector(".names"); if (names && names.children.length !== D.players.length) who(); } });
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
function drawShelf() { const s = document.getElementById("shelf"); if (!s) return; const side = ALLKEYS.filter(k => band(S, k) === "side" && R && k in R.last); s.textContent = ""; if (!side.length) return; s.append(h("span", { class: "lab" }, "Coming back"), ...side.slice(-6).map(k => h("span", { class: "chip" }, show(k)))); }
function setSay(cls, main, sub) { const s = document.getElementById("say"); if (!s) return; s.className = "say " + cls; s.textContent = main; if (sub) s.append(h("span", null, sub)); }
function drawFoot(phase) {
  const f = document.getElementById("foot"); if (!f || !T) return; f.textContent = "";
  if (T.voice) { f.append(h("div", { class: "listen" }, phase === "go" ? h("span", { class: "pulse" }) : null, h("span", { id: "heard" }, phase === "go" ? "Say it!" : " "))); return; }
  if (phase !== "go") return;
  f.append(h("div", { class: "pair" }, h("button", { class: "big no", onclick: () => T.tap && T.tap("no") }, "Not yet"), h("button", { class: "big yes", onclick: () => T.tap && T.tap("yes") }, "Got it")));
}
function sheet(inner) { closeSheet(); document.body.append(h("div", { class: "sheet" }, inner)); }
function closeSheet() { const s = document.querySelector(".sheet"); if (s) s.remove(); }
function familyBox() {
  const box = h("div", { class: "fam" });
  const draw = () => {
    box.textContent = "";
    if (net.ok === null) { box.append(h("p", { class: "small muted" }, "Checking…")); checkNet().then(draw); return; }
    if (!net.ok) { box.append(h("p", { class: "small muted" }, "Family sync is not switched on for this copy of the game yet. Progress stays on this phone.")); return; }
    if (D.family) {
      box.append(h("p", { class: "small" }, "This phone is in a family. To add another phone, open Settings there and join with this code:"), h("p", { class: "code" }, D.family.slice(0, 4) + " " + D.family.slice(4)),
        h("p", { class: "small muted" }, net.note || "Anyone with the code can see and change these players, so keep it in the family."),
        h("button", { class: "ghost", onclick: () => { D.family = null; saveDevice(); draw(); } }, "Take this phone out of the family"));
      return;
    }
    const input = h("input", { type: "text", maxlength: "9", placeholder: "Family code", autocomplete: "off", autocapitalize: "characters" }), msg = h("p", { class: "small muted" }, "");
    const join = async () => { const code = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); msg.textContent = "Joining…"; try { const r = await call("GET", "family/" + code); D.family = r.code; takePlayers(r.players); await sync(); draw(); } catch (e) { msg.textContent = e.message; } };
    const start = async () => { msg.textContent = "Starting…"; try { const r = await call("POST", "family"); D.family = r.code; saveDevice(); for (const p of D.players) { const keep = D.active; D.active = p.id; S = loadState(p.id); await sync(); D.active = keep; } if (D.active) S = loadState(D.active); saveDevice(); draw(); } catch (e) { msg.textContent = e.message; } };
    box.append(h("p", { class: "small" }, "A family code lets the same player carry on from any phone."),
      h("button", { class: "ghost", onclick: start }, "Start a family from this phone"),
      h("div", { class: "newp" }, input, h("button", { class: "ghost", style: "width:auto", onclick: join }, "Join")), msg);
  };
  draw(); return box;
}
function grownUps() {
  const setP = (k, v) => () => { P[k] = v; store.set(SETKEY, P); grownUps(); };
  const opt = (k, v, label) => h("button", { "aria-pressed": String(P[k] === v), onclick: setP(k, v) }, label);
  let armed = false;
  const reset = me() ? h("button", { class: "danger", onclick: () => { if (!armed) { armed = true; reset.textContent = "Tap again to wipe " + me().name + "’s progress"; return; } const g = (S.gen | 0) + 1; S = fresh(); S.gen = g; save(); sync(); closeSheet(); home(); } }, "Reset " + me().name + "’s progress") : null;
  const side = ALLKEYS.filter(k => band(S, k) === "side");
  sheet(h("div", null,
    h("div", { class: "row spread" }, h("h1", null, "Settings"), h("button", { class: "icon", "aria-label": "Close", onclick: () => { closeSheet(); home(); } }, "✕")),
    h("h2", null, "Family"), familyBox(),
    me() ? h("h2", null, me().name + "’s progress") : null,
    !me() ? null : (() => { const c = counts(S, SCHOOL); return h("p", { class: "small muted" }, "School sheet: " + (c.burned + c.locked) + " of " + SCHOOL.length + " words burned"); })(),
    !me() ? null : LISTS.map(l => { const c = counts(S, l.words), n = l.words.length; return h("div", null, h("div", { class: "row spread small" }, h("span", null, l.name), h("span", { class: "muted" }, (c.burned + c.locked) + " of " + n + (c.side ? ", " + c.side + " coming back" : ""))), h("div", { class: "bar" }, ["locked", "burned", "side"].map(b => c[b] ? h("i", { class: b, style: "width:" + (100 * c[b] / n) + "%" }) : null))); }),
    side.length ? [h("h2", null, "Coming back (" + side.length + ")"), h("p", { class: "small" }, side.map(show).join(", "))] : null,
    S.log.length ? [h("h2", null, "Recent misses and what the phone heard"), h("p", { class: "small" }, S.log.slice(-10).reverse().map(r => show(r.k) + " → “" + r.heard + "”").join(", "))] : null,
    h("h2", null, "How answers are checked"),
    SR || NATIVE ? h("div", { class: "seg" }, opt("mode", "voice", "The phone listens"), opt("mode", "tap", "A grown-up taps")) : h("p", { class: "small muted" }, "This browser has no dictation, so a grown-up taps Got it or Not yet."),
    h("h2", null, "Sounds"), h("div", { class: "seg" }, opt("sound", true, "On"), opt("sound", false, "Off")),
    h("h2", null, "How it works"),
    h("p", { class: "small" }, "A word read right and instantly burns. Instant is set from the reader’s own speed, currently within " + secs(instantMs(S)) + (S.rt.length < 6 ? " (a starting value until it has timed a few reads)" : "") + "."),
    h("p", { class: "small" }, "Right but slow, or wrong, and the word comes back every few cards until it gets three instant reads in a row. After a miss the phone says the word and asks for it back. Burned words get one check a week later. It tries a harder word every third new card to find the reader’s edge."),
    h("p", { class: "small" }, "The voice never leaves the phone. With a family code, the player’s name and which words they have read are stored online so other phones can pick them up."),
    h("button", { class: "ghost", onclick: async e => { const b = e.currentTarget, games = [...(store.get("wb.debug.old") || []), store.get("wb.debug") || []]; try { await navigator.clipboard.writeText("Word Burn " + VERSION + "\n" + games.map((g, i) => "--- game " + (i + 1) + " of " + games.length + " ---\n" + g.join("\n")).join("\n")); b.textContent = "Copied. Paste it to Claude."; } catch (x) { b.textContent = "Could not copy."; } } }, "Copy the last games’ record for Claude"),
    h("p", { class: "small muted" }, VERSION + " · ", h("a", { href: "test.html" }, "microphone test")),
    reset));
}
home();
checkNet().then(ok => { if (ok && D.family) pullFamily(); });
