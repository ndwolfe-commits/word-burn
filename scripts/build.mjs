// Builds dist/ from public/. The game's script files get a fingerprint in their names, and the page asks
// version.json (never cached) which fingerprint is current. So a phone that reopens the game always gets the
// newest version, with no need to remove and re-add the home-screen icon.
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), ".."), src = path.join(root, "public"), out = path.join(root, "dist");
const read = f => fs.readFileSync(path.join(src, f), "utf8");
const scripts = ["words.js", "engine.js", "game.js"];
const v = crypto.createHash("sha1").update(scripts.map(read).join("\n")).digest("hex").slice(0, 8);
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(src)) if (!scripts.includes(f) && f !== "index.html") fs.copyFileSync(path.join(src, f), path.join(out, f));
const named = f => f.replace(/\.js$/, "." + v + ".js");
for (const f of scripts) {
  let text = read(f);
  for (const g of scripts) text = text.split('"./' + g + '"').join('"./' + named(g) + '"');
  if (f === "game.js") { if (!text.includes('const BUILD = "dev";')) throw new Error("game.js has no BUILD line"); text = text.replace('const BUILD = "dev";', 'const BUILD = "' + v + '";'); }
  fs.writeFileSync(path.join(out, named(f)), text);
}
const tag = '<script type="module" src="game.js"></script>', page = read("index.html");
if (!page.includes(tag)) throw new Error("index.html has no game script tag");
const loader = `<script type="module">
const boot = v => import("./game." + v + ".js");
fetch("version.json", { cache: "no-store" }).then(r => r.json()).then(j => boot(j.v), () => boot("${v}"));
</script>`;
fs.writeFileSync(path.join(out, "index.html"), page.replace(tag, loader));
fs.writeFileSync(path.join(out, "version.json"), JSON.stringify({ v }) + "\n");
console.log("built dist/ version " + v);
