# Word Burn

A reading game for the phone. A word appears, the reader says it, and the game times how quickly they start. A word read right and instantly burns up in fireworks. Anything else comes back until it sticks.

It runs as a web page that is added to the phone's home screen. The microphone times the start of the voice, and the phone's own dictation names the word. The voice never leaves the phone.

## What is here

- `public/index.html`, `public/game.js`: the game's screen, voice and fireworks.
- `public/hearing.js`: sums about sound that need no microphone, such as working out when a voice began.
- `public/mountain.js`: the mountain progress screen. The path, the camps and the drawing. No rules.
- `public/engine.js`: the rules. Which word comes next, what a reading does to it, what counts as instant.
- `public/words.js`: the word sets, easiest first, and same-sounding spellings.
- `public/test.html`: the microphone test page used to prove the approach on a real phone.
- `test/`: tests for the rules, using pretend readers. Run `npm test`.

- `src/worker.js`: the family store. It serves the game and keeps each player's progress so any phone in the family shows the same thing.

## How it is served

`node scripts/build.mjs` builds `dist/` from `public/`. It fingerprints the script files so a phone that reopens the game always loads the newest version.

Two copies, from the same build:

- **GitHub Pages** (the `gh-pages` branch, a copy of `dist/`). No family sync: progress stays on the phone.
- **Cloudflare** (`wrangler.json`, deployed by `.github/workflows/ci.yml` after the tests pass). This copy has family sync. It deploys only once the repository has the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

## How to publish the web game

1. Raise `SHORT` in `public/game.js` (v15, v16, ...). It is shown under the Play button.
2. `npm test`, then `node scripts/build.mjs`.
3. Commit and push `main`.
4. On the `gh-pages` branch, replace everything except `.nojekyll` and `game.js` with the contents of `dist/`, commit as "Publish game vNN" and push.

## What the family store holds

A first name or nickname for each player, and which words they have read and how quickly. No voice, no email, no account. A family is reached by its code, so the code should stay in the family.

## Rules

- No names, school names or other personal details of any child in this repository. It is public.
- Run the tests before publishing.
