# Where Word Burn stands (27 Nov 2026)

Read this first in a new session. It records what is built, what was decided and why, and what comes next.

## Live
- Web game v17 at https://ndwolfe-commits.github.io/word-burn/ (branch `gh-pages`, built from `main` by `scripts/build.mjs`; publish steps are in the README).
- 41 tests (`npm test`). A phone-like voice test lives outside the repo and should be rebuilt as a proper test.

## The words
- `scripts/make-words.py` builds `public/words.js` from `data/school-lists.json` (the school's sheet: Letters and Sounds high-frequency words plus the national curriculum spelling lists) and the 200 commonest English words the sheet leaves out.
- 557 reading words, commonest first; the school's 150 rare spelling words come last. Settings shows progress against the school's 507 as well.
- Frequency is from general adult English (`wordfreq`). Redoing it with a children's-book count is parked.

## How a round works
- Instant read on first sight: burned, checked once a week later, then locked. Slow or wrong: practised until read instantly three times in a row, then spaced checks.
- Words of four letters or more lead; the very short ones are a five-card sprint at the end of each round.
- After a miss: one word the reader already owns (one due its check, if any), and the reader says the missed word back.
- The last eight cards set the pace: more hard words when nearly all are instant, none on a bad day.
- A new word is held back while a look-alike is in practice.
- Hearing: exact match; or the reader's own learned way of saying it; or a near miss given the benefit of the doubt, which puts the word on a shorter leash. A different word from the list is never forgiven. These three are on probation: remove them if the first real child's record shows they never fire.

## The mountain (built in v15)
- The first screen. One step for every burned word, 707 to the summit; a camp where each set ends (100, 200, 300, 400, 500, 557). It reads the engine's counts and changes no rule.
- After a round the climber walks from where he was to where he is, lighting stones and stopping to cheer at a camp. He never walks down: if words were forgotten he simply stands lower next time.
- Words in practice show as gems on the stones ahead ("words to pick up"); ones burned in the round are collected as he passes.
- Two numbers: steps of 707, and the school sheet of 507. The small map in the corner fills up the whole mountain and counts down the steps to the next camp (added in v16: a round was too small to see on the map alone).
- `public/mountain.js` holds the path, camps and drawing; `game.js` puts it on screen. The climber is a stand-in drawn by one function, `climber()`: the child chooses the real one.
- Checked in a phone-sized Chrome on a computer (new player, part way, summit, small screen, a tapped round crossing a camp). Not yet seen on a real iPhone, and the walk has not been seen after a voice round.

## First round on a real iPhone (v15, Safari, an adult reading)
- The mountain and the walk worked. All 20 words were heard right first time, but the reader had to be close to the phone and speak clearly; the loudest levels in the record were low (0.010 to 0.025).
- Not yet known whether the weak link is the phone's dictation or the game's own voice-start line. In v17 a trial switch was added in Settings, "Microphone (a trial)": Hears quieter voices asks the phone to turn a quiet voice up (the microphone's automatic gain). Off by default, web version only, never tried on a real phone before publishing. The game record now says which setting was used and whether the phone honoured it. Keep it or remove it once a real record shows whether it helps. The iPhone app listens differently (it tells the recogniser which word to expect), so judge it there first.
- Wispr Flow was looked at as a replacement: its API is by approval only and runs on their servers, which breaks "the voice never leaves the phone". Not pursued.

## The iPhone app
- `ios/` is a thin shell: a web view showing the same game, with listening and speaking done natively (`ios/App/Ears.swift`). The page talks to it through `window.webkit.messageHandlers.ears` and `window.__ears`.
- It compiles on GitHub's Macs (`.github/workflows/ios.yml`). It has never run on a phone.
- Bundle ID agreed: `net.nathanwolfe.wordburn`.
- Blocked on: the Apple Developer membership going from Pending to active, then an App Store Connect API key (Admin role) added as GitHub secrets by the owner, never pasted into a chat. After that: signing, TestFlight upload, first real round.

## Agreed, not started
1. The child picks the climber for the mountain.
2. Family sync: the Worker in `src/worker.js` is written and tested locally; it needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub secrets.
3. A second app, Senet (its own repository), through the same App Store pipeline.

## Dropped
- Diagnostics (made-up words, a reading profile page). A Settings list of accepted pronunciations. An across-words speech rule.

## Parked
- Spelling as a second game. A paid speech engine built for children. A model of which kinds of word trip a reader. A write-up for the school.

## Rules
- No names, school names or other personal details of any child in this repository. It is public.
- The owner is not a software engineer: plain words, click-by-click steps, say what was and was not tested.
