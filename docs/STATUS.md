# Where Word Burn stands (27 Nov 2026)

Read this first in a new session. It records what is built, what was decided and why, and what comes next.

## Live
- Web game v14 at https://ndwolfe-commits.github.io/word-burn/ (branch `gh-pages`, built from `main` by `scripts/build.mjs`; publish steps are in the README).
- 31 tests (`npm test`). A phone-like voice test lives outside the repo and should be rebuilt as a proper test.

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

## The iPhone app
- `ios/` is a thin shell: a web view showing the same game, with listening and speaking done natively (`ios/App/Ears.swift`). The page talks to it through `window.webkit.messageHandlers.ears` and `window.__ears`.
- It compiles on GitHub's Macs (`.github/workflows/ios.yml`). It has never run on a phone.
- Bundle ID agreed: `net.nathanwolfe.wordburn`.
- Blocked on: the Apple Developer membership going from Pending to active, then an App Store Connect API key (Admin role) added as GitHub secrets by the owner, never pasted into a chat. After that: signing, TestFlight upload, first real round.

## Agreed, not started
1. The mountain: 707 steps, camps at each set, the climber walks up after each round, shown on opening. The child picks the climber.
2. Family sync: the Worker in `src/worker.js` is written and tested locally; it needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub secrets.
3. A second app, Senet (its own repository), through the same App Store pipeline.

## Dropped
- Diagnostics (made-up words, a reading profile page). A Settings list of accepted pronunciations. An across-words speech rule.

## Parked
- Spelling as a second game. A paid speech engine built for children. A model of which kinds of word trip a reader. A write-up for the school.

## Rules
- No names, school names or other personal details of any child in this repository. It is public.
- The owner is not a software engineer: plain words, click-by-click steps, say what was and was not tested.
