# Word Burn

A reading game for the phone. A word appears, the reader says it, and the game times how quickly they start. A word read right and instantly burns up in fireworks. Anything else comes back until it sticks.

It runs as a web page that is added to the phone's home screen. The microphone times the start of the voice, and the phone's own dictation names the word. Nothing is sent anywhere, and progress is kept on the phone.

## What is here

- `public/index.html`, `public/game.js`: the game's screen, voice and fireworks.
- `public/engine.js`: the rules. Which word comes next, what a reading does to it, what counts as instant.
- `public/words.js`: the word sets, easiest first, and same-sounding spellings.
- `public/test.html`: the microphone test page used to prove the approach on a real phone.
- `test/`: tests for the rules, using pretend readers. Run `node --test test/*.test.mjs`.

## How it is served

The `gh-pages` branch holds a copy of `public/` and GitHub Pages serves it.

## Rules

- No names, school names or other personal details of any child in this repository. It is public.
- Run the tests before publishing.
