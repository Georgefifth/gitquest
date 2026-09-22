// Tiny WebAudio sound kit — no assets, just oscillators.

let ctx = null;
let enabled = true;

const ac = () => (ctx ??= new (window.AudioContext || window.webkitAudioContext)());

function tone(freq, dur, type = "square", gain = .04, when = 0) {
  if (!enabled) return;
  try {
    const t = ac().currentTime + when;
    const o = ac().createOscillator();
    const g = ac().createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(ac().destination);
    o.start(t);
    o.stop(t + dur);
  } catch { /* audio blocked until user gesture — fine */ }
}

export const sfx = {
  key:     () => tone(1200 + Math.random() * 300, .02, "square", .012),
  ok:      () => { tone(660, .08); tone(990, .1, "square", .04, .07); },
  err:     () => tone(140, .18, "sawtooth", .05),
  pop:     () => tone(520, .06, "triangle", .05),
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .16, "square", .05, i * .11)),
  boot:    () => tone(440, .05, "square", .02),
};

export const toggleSound = () => (enabled = !enabled, enabled);
export const soundOn = () => enabled;
