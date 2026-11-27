// Word Burn hearing: sums about sound that need no microphone, so they can be tested with plain numbers.

// When the voice began, worked out after the word has been heard, from the sound levels kept while listening.
// The live rule waits for sound 12 times louder than the room. In a noisy room, or with a soft voice, a real voice
// never gets that far above the room, so the read could not be timed. Looking back, the loudest moment of the word
// is known, so the start can be placed where the sound first climbed a good part of the way from room to loudest.
// hist is a flat list: time, level, time, level, ... Returns milliseconds after t0, or null if there was no clear voice.
export function voiceStart(hist, t0, floor, peak) {
  if (!(peak >= 0.003) || !(peak > Math.max(floor, 0.00005) * 3)) return null;   // nothing that stands clear of the room
  const line = floor + (peak - floor) * 0.3;
  let start = 0;
  for (let i = 0; i + 1 < hist.length; i += 2) {
    const t = hist[i], v = hist[i + 1];
    if (t - t0 > 120 && v > line) { if (!start) start = t; if (t - start >= 30) return Math.round(start - t0); }
    else start = 0;
  }
  return null;
}
