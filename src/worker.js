// Word Burn family store. Serves the game's files and keeps each player's progress so any phone in the family
// shows the same thing. A family is reached by its code alone, so the code is the key: unguessable, and worth
// keeping within the family. What is stored: a first name or nickname per player, and which words they have read.
import { mergeState, cleanState } from "../public/engine.js";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";       // no 0, O, 1, I or L
const CODE = /^[A-HJ-NP-Z2-9]{8}$/, ID = /^[a-z0-9]{6,16}$/;
const MAX_BODY = 200000, MAX_PLAYERS = 12, KEEP = 60 * 60 * 24 * 400;   // unused families fade after about 13 months

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const bad = (status, error) => json({ error }, status);
export function newCode() { const b = crypto.getRandomValues(new Uint8Array(8)); return Array.from(b, x => ALPHABET[x % ALPHABET.length]).join(""); }
export const cleanName = n => String(n == null ? "" : n).replace(/[\u0000-\u001f<>&"'`\\]/g, "").trim().slice(0, 20);

async function readJson(request) {
  const text = await request.text(); if (text.length > MAX_BODY) return { tooBig: true };
  try { return { body: JSON.parse(text) }; } catch (e) { return { invalid: true }; }
}
const famKey = code => "fam:" + code, stKey = (code, id) => "st:" + code + ":" + id;
async function getJson(kv, key) { const t = await kv.get(key); if (!t) return null; try { return JSON.parse(t); } catch (e) { return null; } }
const putJson = (kv, key, value) => kv.put(key, JSON.stringify(value), { expirationTtl: KEEP });

export async function api(request, env, path) {
  const kv = env.WB_KV, m = request.method, parts = path.split("/").filter(Boolean);     // ["api", ...]
  if (!kv) return bad(503, "The family store is not set up.");
  if (parts[1] === "health" && m === "GET") return json({ ok: true });
  if (parts[1] !== "family") return bad(404, "No such address.");

  if (parts.length === 2 && m === "POST") {
    for (let i = 0; i < 5; i++) { const code = newCode(); if (await kv.get(famKey(code))) continue; await putJson(kv, famKey(code), { created: Date.now(), players: [] }); return json({ code, players: [] }, 201); }
    return bad(503, "Could not make a family code. Try again.");
  }
  const code = String(parts[2] || "").toUpperCase(); if (!CODE.test(code)) return bad(400, "That family code is not the right shape.");
  const fam = await getJson(kv, famKey(code)); if (!fam) return bad(404, "No family has that code.");
  if (parts.length === 3 && m === "GET") return json({ code, players: fam.players });

  if (parts[3] === "players" && parts.length === 5) {
    const id = parts[4]; if (!ID.test(id)) return bad(400, "That player id is not the right shape.");
    if (m === "GET") { const st = await getJson(kv, stKey(code, id)); return st ? json({ state: st }) : bad(404, "No such player."); }
    if (m === "PUT") {
      const r = await readJson(request); if (r.tooBig) return bad(413, "Too much data."); if (r.invalid || !r.body) return bad(400, "That was not readable.");
      const name = cleanName(r.body.name), incoming = cleanState(r.body.state);
      if (!name) return bad(400, "A player needs a name."); if (!incoming) return bad(400, "That progress was not readable.");
      let players = fam.players.slice(); const at = players.findIndex(p => p.id === id);
      if (at < 0) { if (players.length >= MAX_PLAYERS) return bad(409, "This family already has " + MAX_PLAYERS + " players."); players.push({ id, name }); } else players[at] = { id, name };
      const merged = mergeState(cleanState(await getJson(kv, stKey(code, id))), incoming);
      await putJson(kv, stKey(code, id), merged);
      await putJson(kv, famKey(code), { created: fam.created, players });
      return json({ state: merged, players });
    }
  }
  return bad(405, "That is not something this address does.");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      try { return await api(request, env, url.pathname); } catch (e) { return bad(500, "Something went wrong in the family store."); }
    }
    return env.ASSETS.fetch(request);
  },
};
