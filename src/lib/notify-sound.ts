"use client";

// Notification tones, all synthesized with the Web Audio API - no audio
// assets. Each tone is a tiny recipe of oscillator notes (or noise bursts for
// percussive ones). The user's pick is stored per-browser in localStorage and
// used by the toaster and chat alerts.

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return null;
    audioCtx ??= new Ctx();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

type Note = {
  freq: number;
  at: number; // seconds after start
  dur?: number; // seconds, default 0.3
  type?: OscillatorType; // default sine
  vol?: number; // 0..1 peak, default 0.15
};

type Knock = { at: number; vol?: number; tone?: number };

type ToneRecipe = {
  notes?: Note[];
  knocks?: Knock[]; // percussive taps (Slack-style)
};

function playRecipe(recipe: ToneRecipe) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  for (const n of recipe.notes ?? []) {
    const dur = n.dur ?? 0.3;
    const vol = n.vol ?? 0.15;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, now + n.at);
    gain.gain.exponentialRampToValueAtTime(vol, now + n.at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.at + dur);
    const osc = ctx.createOscillator();
    osc.type = n.type ?? "sine";
    osc.frequency.setValueAtTime(n.freq, now + n.at);
    osc.connect(gain);
    osc.start(now + n.at);
    osc.stop(now + n.at + dur + 0.05);
  }

  // Percussive knock: a short filtered noise burst + low thump.
  for (const k of recipe.knocks ?? []) {
    const vol = k.vol ?? 0.3;
    const tone = k.tone ?? 180;

    const bufferLen = Math.floor(ctx.sampleRate * 0.06);
    const buffer = ctx.createBuffer(1, bufferLen, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferLen; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferLen);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(vol * 0.6, now + k.at);
    nGain.gain.exponentialRampToValueAtTime(0.0001, now + k.at + 0.08);
    noise.connect(filter).connect(nGain).connect(ctx.destination);
    noise.start(now + k.at);

    const thump = ctx.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(tone, now + k.at);
    thump.frequency.exponentialRampToValueAtTime(tone * 0.6, now + k.at + 0.09);
    const tGain = ctx.createGain();
    tGain.gain.setValueAtTime(0.0001, now + k.at);
    tGain.gain.exponentialRampToValueAtTime(vol, now + k.at + 0.008);
    tGain.gain.exponentialRampToValueAtTime(0.0001, now + k.at + 0.12);
    thump.connect(tGain).connect(ctx.destination);
    thump.start(now + k.at);
    thump.stop(now + k.at + 0.15);
  }
}

export type SoundOption = { id: string; label: string; recipe: ToneRecipe };

// 16 tones. "knock" is the Slack-style one.
export const SOUND_OPTIONS: SoundOption[] = [
  {
    id: "classic",
    label: "Classic Ding",
    recipe: { notes: [{ freq: 880, at: 0 }, { freq: 1320, at: 0.09 }] },
  },
  {
    id: "knock",
    label: "Knock Brush (Slack)",
    recipe: { knocks: [{ at: 0, tone: 190 }, { at: 0.14, tone: 170 }] },
  },
  {
    id: "chime",
    label: "Soft Chime",
    recipe: {
      notes: [
        { freq: 1046.5, at: 0, dur: 0.5, vol: 0.12 },
        { freq: 1568, at: 0.02, dur: 0.6, vol: 0.08 },
      ],
    },
  },
  {
    id: "bell",
    label: "Bell",
    recipe: {
      notes: [
        { freq: 1318.5, at: 0, dur: 0.7, vol: 0.14, type: "triangle" },
        { freq: 2637, at: 0, dur: 0.4, vol: 0.05 },
      ],
    },
  },
  {
    id: "pop",
    label: "Pop",
    recipe: { notes: [{ freq: 520, at: 0, dur: 0.08, vol: 0.22, type: "square" }] },
  },
  {
    id: "bubble",
    label: "Bubble",
    recipe: {
      notes: [
        { freq: 420, at: 0, dur: 0.1, vol: 0.16 },
        { freq: 640, at: 0.06, dur: 0.12, vol: 0.16 },
      ],
    },
  },
  {
    id: "triple",
    label: "Triple Tap",
    recipe: {
      notes: [
        { freq: 780, at: 0, dur: 0.09, vol: 0.13 },
        { freq: 780, at: 0.12, dur: 0.09, vol: 0.13 },
        { freq: 980, at: 0.24, dur: 0.14, vol: 0.15 },
      ],
    },
  },
  {
    id: "rise",
    label: "Rising",
    recipe: {
      notes: [
        { freq: 523, at: 0, dur: 0.1, vol: 0.13 },
        { freq: 659, at: 0.09, dur: 0.1, vol: 0.13 },
        { freq: 784, at: 0.18, dur: 0.2, vol: 0.15 },
      ],
    },
  },
  {
    id: "drop",
    label: "Droplet",
    recipe: {
      notes: [
        { freq: 1200, at: 0, dur: 0.07, vol: 0.14 },
        { freq: 700, at: 0.07, dur: 0.18, vol: 0.13 },
      ],
    },
  },
  {
    id: "marimba",
    label: "Marimba",
    recipe: {
      notes: [
        { freq: 659, at: 0, dur: 0.25, vol: 0.17, type: "triangle" },
        { freq: 880, at: 0.14, dur: 0.3, vol: 0.15, type: "triangle" },
      ],
    },
  },
  {
    id: "glass",
    label: "Glass Ping",
    recipe: {
      notes: [
        { freq: 1975.5, at: 0, dur: 0.5, vol: 0.09 },
        { freq: 2793.8, at: 0.01, dur: 0.35, vol: 0.05 },
      ],
    },
  },
  {
    id: "retro",
    label: "Retro Beep",
    recipe: {
      notes: [
        { freq: 987.8, at: 0, dur: 0.09, vol: 0.1, type: "square" },
        { freq: 1318.5, at: 0.1, dur: 0.12, vol: 0.1, type: "square" },
      ],
    },
  },
  {
    id: "horn",
    label: "Soft Horn",
    recipe: {
      notes: [
        { freq: 392, at: 0, dur: 0.28, vol: 0.14, type: "sawtooth" },
        { freq: 523.3, at: 0.02, dur: 0.3, vol: 0.07, type: "sawtooth" },
      ],
    },
  },
  {
    id: "twinkle",
    label: "Twinkle",
    recipe: {
      notes: [
        { freq: 1568, at: 0, dur: 0.12, vol: 0.1 },
        { freq: 2093, at: 0.09, dur: 0.12, vol: 0.09 },
        { freq: 2637, at: 0.18, dur: 0.22, vol: 0.08 },
      ],
    },
  },
  {
    id: "pulse",
    label: "Pulse",
    recipe: {
      notes: [
        { freq: 660, at: 0, dur: 0.1, vol: 0.15 },
        { freq: 660, at: 0.16, dur: 0.16, vol: 0.15 },
      ],
    },
  },
  {
    id: "low-thud",
    label: "Low Thud",
    recipe: { knocks: [{ at: 0, tone: 130, vol: 0.35 }] },
  },
];

const STORAGE_KEY = "notify-sound";
const DEFAULT_SOUND = "classic";

export function getSelectedSound(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && SOUND_OPTIONS.some((o) => o.id === v)) return v;
  } catch {
    // ignore
  }
  return DEFAULT_SOUND;
}

export function setSelectedSound(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

// Play a specific tone (settings preview).
export function playSound(id: string) {
  const opt = SOUND_OPTIONS.find((o) => o.id === id);
  if (opt) playRecipe(opt.recipe);
}

// Play the user's chosen notification tone. Kept as the existing public name
// so all call sites keep working.
export function playNotificationSound() {
  playSound(getSelectedSound());
}
