import test from "node:test";
import assert from "node:assert/strict";
import worker, { cleanName } from "../src/worker.js";
import { fresh, grade } from "../public/engine.js";

function world() {
  const store = new Map();
  const env = { WB_KV: { get: async k => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } }, ASSETS: { fetch: async () => new Response("page") } };
  const call = async (method, path, body) => { const r = await worker.fetch(new Request("https://x.test" + path, { method, body: body ? JSON.stringify(body) : undefined }), env); return { status: r.status, body: r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text() }; };
  return { store, call };
}
const stateWith = (words, updated) => { const s = fresh(); for (const w of words) grade(s, w, "fast", 600, 100); s.updated = updated; return s; };

test("pages are served for anything that is not the family store", async () => { const { call } = world(); assert.equal((await call("GET", "/")).body, "page"); assert.equal((await call("GET", "/game.js")).body, "page"); });
test("a family is made, a player saved, and a second phone sees the same progress", async () => {
  const { call } = world();
  const fam = await call("POST", "/api/family"); assert.equal(fam.status, 201); assert.match(fam.body.code, /^[A-HJ-NP-Z2-9]{8}$/);
  const code = fam.body.code;
  const put = await call("PUT", `/api/family/${code}/players/abc12345`, { name: "Sam", state: stateWith(["the", "and"], 1000) });
  assert.equal(put.status, 200); assert.deepEqual(put.body.players, [{ id: "abc12345", name: "Sam" }]);
  const list = await call("GET", `/api/family/${code.toLowerCase()}`); assert.deepEqual(list.body.players, [{ id: "abc12345", name: "Sam" }]);
  const second = await call("PUT", `/api/family/${code}/players/abc12345`, { name: "Sam", state: stateWith(["said"], 2000) });
  assert.deepEqual(Object.keys(second.body.state.w).sort(), ["and", "said", "the"], "the second phone gets the first phone's words back");
  const got = await call("GET", `/api/family/${code}/players/abc12345`); assert.equal(Object.keys(got.body.state.w).length, 3);
});
test("wrong codes, ids and bodies are refused plainly", async () => {
  const { call } = world(); const code = (await call("POST", "/api/family")).body.code;
  assert.equal((await call("GET", "/api/family/NOPE")).status, 400);
  assert.equal((await call("GET", "/api/family/ABCDEFGH")).status, 404);
  assert.equal((await call("PUT", `/api/family/${code}/players/BAD ID`, { name: "x", state: fresh() })).status, 400);
  assert.equal((await call("PUT", `/api/family/${code}/players/abc12345`, { name: "", state: fresh() })).status, 400);
  assert.equal((await call("PUT", `/api/family/${code}/players/abc12345`, { name: "Sam", state: "junk" })).status, 400);
  assert.equal((await call("PUT", `/api/family/${code}/players/abc12345`, { name: "Sam", state: Object.assign(fresh(), { pad: "x".repeat(210000) }) })).status, 413);
  assert.equal((await call("DELETE", `/api/family/${code}`)).status, 405);
});
test("a family holds at most twelve players, and names are cleaned", async () => {
  const { call } = world(); const code = (await call("POST", "/api/family")).body.code;
  for (let i = 0; i < 12; i++) assert.equal((await call("PUT", `/api/family/${code}/players/player${String(i).padStart(2, "0")}`, { name: "P" + i, state: fresh() })).status, 200);
  assert.equal((await call("PUT", `/api/family/${code}/players/player99`, { name: "P", state: fresh() })).status, 409);
  assert.equal(cleanName('  <b>Sam</b>"\u0007 the very very long name indeed '), "bSam/b the very very");
});
test("without the store set up, the game still gets a clear answer", async () => {
  const r = await worker.fetch(new Request("https://x.test/api/health"), { ASSETS: { fetch: async () => new Response("page") } }); assert.equal(r.status, 503);
});

test("the build fingerprints the scripts and the page loads whichever version.json names", async () => {
  const { execFileSync } = await import("node:child_process"); const fs = await import("node:fs");
  execFileSync("node", ["scripts/build.mjs"]);
  const v = JSON.parse(fs.readFileSync("dist/version.json", "utf8")).v; assert.match(v, /^[0-9a-f]{8}$/);
  for (const f of ["game", "engine", "words"]) assert.ok(fs.existsSync(`dist/${f}.${v}.js`), f);
  assert.ok(fs.readFileSync(`dist/game.${v}.js`, "utf8").includes(`"./engine.${v}.js"`));
  assert.ok(fs.readFileSync(`dist/engine.${v}.js`, "utf8").includes(`"./words.${v}.js"`));
  const page = fs.readFileSync("dist/index.html", "utf8"); assert.ok(page.includes('fetch("version.json", { cache: "no-store" })')); assert.ok(!page.includes('src="game.js"'));
  assert.ok(fs.existsSync("dist/test.html") && fs.existsSync("dist/icon-180.png"));
});
