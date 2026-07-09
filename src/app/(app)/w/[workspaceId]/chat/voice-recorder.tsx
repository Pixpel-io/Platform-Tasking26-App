"use client";

import { useEffect, useRef, useState } from "react";

// Slack-style voice message recorder. The mic button starts a MediaRecorder;
// while recording the composer shows a red bar with a live level meter and
// timer, plus stop (send) / cancel. The finished clip is handed to the
// composer's normal upload pipeline (S3-first) as an audio file.

const MAX_SECONDS = 300; // 5 minutes, Slack-like cap

// Best supported audio container for MediaRecorder in this browser.
function pickMime(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? "";
}

function extFor(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

export function VoiceRecorder({
  onFinish,
  onError,
}: {
  onFinish: (file: File, durationMs: number) => void;
  onError: (message: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0); // 0..1 live mic level

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);

  // Full teardown of recorder, stream, meter and timers.
  function cleanup() {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    cancelAnimationFrame(rafRef.current);
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
    setSeconds(0);
    setLevel(0);
  }

  useEffect(() => cleanup, []);

  async function start() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError("Microphone access was blocked. Allow it in your browser.");
      return;
    }

    const mime = pickMime();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      onError("Recording isn't supported in this browser.");
      return;
    }

    chunksRef.current = [];
    cancelledRef.current = false;
    startedAtRef.current = Date.now();
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const durationMs = Date.now() - startedAtRef.current;
      // MediaRecorder reports e.g. "audio/webm;codecs=opus" - strip the codec
      // parameter: S3 validation (and Content-Type matching) want a bare type.
      const type = (recorder.mimeType || mime || "audio/webm").split(";")[0];
      const blob = new Blob(chunksRef.current, { type });
      const discarded = cancelledRef.current || durationMs < 500;
      cleanup();
      if (discarded) return; // cancelled or accidental tap
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      onFinish(
        new File([blob], `voice-message-${stamp}.${extFor(type)}`, { type }),
        durationMs,
      );
    };

    // Live level meter for the Slack-style pulsing bar.
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
        setLevel(peak);
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch {
      // Meter is cosmetic - recording works without it.
    }

    recorderRef.current = recorder;
    streamRef.current = stream;
    recorder.start();
    setRecording(true);
    setSeconds(0);
    tickRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) stop(); // hard cap
        return s + 1;
      });
    }, 1000);
  }

  function stop() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function cancel() {
    cancelledRef.current = true;
    stop();
  }

  const mm = String(Math.floor(seconds / 60)).padStart(1, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  if (!recording) {
    return (
      <button
        onClick={() => void start()}
        aria-label="Record a voice message"
        title="Record a voice message"
        className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <svg
          className="h-4.5 w-4.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" />
        </svg>
      </button>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-2 rounded-full bg-danger/10 py-1 pl-3 pr-1 ring-1 ring-inset ring-danger/30">
      {/* Pulsing rec dot + timer */}
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
      </span>
      <span className="text-xs font-semibold tabular-nums text-danger">
        {mm}:{ss}
      </span>

      {/* Live level bars */}
      <span className="flex h-4 items-center gap-0.5" aria-hidden>
        {[0.5, 0.9, 0.7, 1, 0.6].map((weight, i) => (
          <span
            key={i}
            className="w-0.5 rounded-full bg-danger transition-all duration-75"
            style={{
              height: `${Math.max(3, Math.min(16, 3 + level * weight * 15))}px`,
            }}
          />
        ))}
      </span>

      {/* Cancel */}
      <button
        onClick={cancel}
        aria-label="Cancel recording"
        title="Cancel"
        className="grid h-6 w-6 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-danger/15 hover:text-danger"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Stop = finish and attach */}
      <button
        onClick={stop}
        aria-label="Finish recording"
        title="Finish recording"
        className="grid h-6 w-6 cursor-pointer place-items-center rounded-full bg-danger text-white transition-opacity hover:opacity-85"
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      </button>
    </span>
  );
}
