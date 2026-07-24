"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  ArrowUp02Icon,
  Cancel01Icon,
  Loading03Icon,
  Mic01Icon,
  StopIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { transcribeAudio } from "@/lib/api/transcriptions-client";
import "./Composer.css";

const MAX_TEXTAREA_HEIGHT = 200;
const PREFERRED_AUDIO_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

// Rolling amplitude history drawn as bars. One bar is sampled per interval,
// and the whole strip scrolls left continuously (a fraction of a bar-step per
// frame) instead of jumping a slot at a time — measured from ChatGPT's
// dictation bar: 3px bars, 3px gaps, one step per ~200ms (~30px/s drift).
const WAVEFORM_SAMPLE_MS = 200;
const WAVEFORM_EASE_MS = 240;
const WAVEFORM_BAR_WIDTH = 3.5;
const WAVEFORM_BAR_GAP = 3;
const WAVEFORM_MIN_BAR_HEIGHT = 3;
// Fraction of the width over which each edge fades to transparent, so bars
// dissolve in/out at the left and right rather than clipping hard — matches
// ChatGPT's dictation bar (measured ~5% ramp on each side).
const WAVEFORM_EDGE_FADE = 0.06;
// RMS gain + compression exponent. GAIN lifts the whole signal so even quiet
// room ambience clears the idle floor; the low COMPRESSION exponent boosts
// quiet sounds much more than loud ones — a strong quiet-end response while
// the ceiling stays put (1^exp === 1), so loud speech still maxes out the bar.
const WAVEFORM_GAIN = 9;
const WAVEFORM_COMPRESSION = 0.45;

type DictationStatus = "idle" | "preparing" | "recording" | "transcribing";

interface ComposerProps {
  onSend?: (message: string) => void;
  busy?: boolean;
  disabled?: boolean;
  captureGlobalTyping?: boolean;
  onCancel?: () => void;
}

function resizeTextarea(element: HTMLTextAreaElement) {
  element.style.height = "auto";
  element.style.height = `${Math.min(element.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
}

export default function Composer({
  onSend,
  busy = false,
  disabled = false,
  captureGlobalTyping = true,
  onCancel,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const [dictationStatus, setDictationStatus] = useState<DictationStatus>("idle");
  const [dictationError, setDictationError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcriptionAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const discardNextRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const waveformFrameRef = useRef<number | null>(null);
  const waveformBarsRef = useRef<number[]>([]);
  const waveformEaseStartRef = useRef<number[]>([]);
  const lastSampleAtRef = useRef(0);

  function stopWaveform() {
    if (waveformFrameRef.current !== null) {
      cancelAnimationFrame(waveformFrameRef.current);
      waveformFrameRef.current = null;
    }
    analyserRef.current = null;
    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      transcriptionAbortRef.current?.abort();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      stopWaveform();
    };
  }, []);

  useEffect(() => {
    if (!captureGlobalTyping) return;

    function handleGlobalTyping(event: globalThis.KeyboardEvent) {
      if (
        disabled ||
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        Array.from(event.key).length !== 1
      ) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
      ) {
        return;
      }

      const textarea = textareaRef.current;
      if (!textarea || textarea.disabled) return;

      event.preventDefault();
      const selectionStart = textarea.selectionStart ?? textarea.value.length;
      const selectionEnd = textarea.selectionEnd ?? textarea.value.length;
      textarea.setRangeText(event.key, selectionStart, selectionEnd, "end");
      setValue(textarea.value);
      resizeTextarea(textarea);
      textarea.focus();
    }

    window.addEventListener("keydown", handleGlobalTyping);
    return () => window.removeEventListener("keydown", handleGlobalTyping);
  }, [captureGlobalTyping, disabled]);

  // While recording, Esc cancels (discards) and Enter stops + transcribes,
  // mirroring the ✕ / ✓ buttons. Only bound during recording so it never
  // interferes with normal typing or the transcribing/idle states.
  useEffect(() => {
    if (dictationStatus !== "recording") return;

    function handleDictationKeys(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        discardNextRef.current = true;
        setDictationError(null);
        recorderRef.current?.stop();
      } else if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        setDictationStatus("transcribing");
        recorderRef.current?.stop();
      }
    }

    window.addEventListener("keydown", handleDictationKeys);
    return () => window.removeEventListener("keydown", handleDictationKeys);
  }, [dictationStatus]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    resizeTextarea(e.target);
  }

  function handleSend() {
    if (busy) {
      onCancel?.();
      return;
    }
    if (dictationStatus !== "idle") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend?.(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function stopMediaStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  // Stops the animation loop and releases audio, but leaves the last-drawn
  // frame on the canvas and the bar data intact — so the waveform stays
  // visibly frozen while transcription runs. Bar arrays are reset on the next
  // start() (and on unmount) rather than here.
  function startWaveform(stream: MediaStream) {
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const audioContext = new AudioContextCtor();
    const analyser = audioContext.createAnalyser();
    // ~42ms window at 48kHz — long enough that the RMS reading is stable
    // rather than jittering with whatever 5ms slice a frame happens to catch.
    analyser.fftSize = 2048;
    audioContext.createMediaStreamSource(stream).connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    waveformBarsRef.current = [];
    waveformEaseStartRef.current = [];
    lastSampleAtRef.current = 0;

    const timeData = new Uint8Array(analyser.fftSize);

    const draw = (timestamp: number) => {
      waveformFrameRef.current = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (lastSampleAtRef.current === 0) lastSampleAtRef.current = timestamp;
      if (timestamp - lastSampleAtRef.current >= WAVEFORM_SAMPLE_MS) {
        lastSampleAtRef.current = timestamp;
        analyser.getByteTimeDomainData(timeData);
        // RMS over the window, boosted and soft-compressed so quiet ambience
        // still reads as a live signal instead of a flat line.
        let sumSquares = 0;
        for (const value of timeData) {
          const deviation = (value - 128) / 128;
          sumSquares += deviation * deviation;
        }
        const rms = Math.sqrt(sumSquares / timeData.length);
        const level = Math.min(1, Math.pow(rms * WAVEFORM_GAIN, WAVEFORM_COMPRESSION));
        const bars = waveformBarsRef.current;
        const easeStart = waveformEaseStartRef.current;
        bars.push(level);
        // Each bar's height is fixed once sampled; it eases in from zero
        // over WAVEFORM_EASE_MS starting now, rather than appearing instantly.
        easeStart.push(timestamp);
        const maxBars = Math.ceil(canvas.clientWidth / (WAVEFORM_BAR_WIDTH + WAVEFORM_BAR_GAP)) + 2;
        if (bars.length > maxBars) bars.splice(0, bars.length - maxBars);
        if (easeStart.length > maxBars) easeStart.splice(0, easeStart.length - maxBars);
      }

      drawWaveform(canvas, timestamp);
    };
    waveformFrameRef.current = requestAnimationFrame(draw);
  }

  // Smoothstep ease so each bar rises/falls gradually toward its sampled
  // target instead of jumping there the instant a new sample lands.
  function easeInOut(t: number): number {
    return t * t * (3 - 2 * t);
  }

  function drawWaveform(canvas: HTMLCanvasElement, timestamp: number) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const color = getComputedStyle(canvas).color;
    // Draw each bar as a round-capped vertical stroke so its ends are fully
    // rounded pills, like ChatGPT's waveform.
    ctx.strokeStyle = color;
    ctx.lineWidth = WAVEFORM_BAR_WIDTH;
    ctx.lineCap = "round";

    const bars = waveformBarsRef.current;
    const easeStart = waveformEaseStartRef.current;
    const step = WAVEFORM_BAR_WIDTH + WAVEFORM_BAR_GAP;
    const centerY = height / 2;
    // The round caps extend half the line width past each endpoint, so keep
    // the drawn segment short enough that a full-height bar's caps stay inside
    // the canvas rather than clipping.
    const halfCap = WAVEFORM_BAR_WIDTH / 2;
    const maxHalf = height / 2 - halfCap;
    // Continuous scroll: the strip drifts left by a fraction of a bar-step
    // every frame, so by the time the next sample lands the newest bar has
    // moved exactly one step over — no per-slot jumping.
    const scrollFrac = Math.min(1, (timestamp - lastSampleAtRef.current) / WAVEFORM_SAMPLE_MS);
    let x = width - halfCap - scrollFrac * step;

    const strokeBar = (cx: number, halfHeight: number) => {
      const clamped = Math.min(maxHalf, Math.max(halfCap, halfHeight));
      ctx.beginPath();
      ctx.moveTo(cx, centerY - clamped + halfCap);
      ctx.lineTo(cx, centerY + clamped - halfCap);
      ctx.stroke();
    };

    for (let i = bars.length - 1; i >= 0 && x > -WAVEFORM_BAR_WIDTH; i -= 1) {
      const progress = Math.min(1, (timestamp - easeStart[i]) / WAVEFORM_EASE_MS);
      const level = bars[i] * easeInOut(progress);

      const halfHeight = Math.max(WAVEFORM_MIN_BAR_HEIGHT, level * height) / 2;
      strokeBar(x, halfHeight);
      x -= step;
    }
    // Fill any remaining leading space with idle dots, same as ChatGPT's bar.
    ctx.globalAlpha = 0.35;
    while (x > -WAVEFORM_BAR_WIDTH) {
      strokeBar(x, WAVEFORM_MIN_BAR_HEIGHT / 2);
      x -= step;
    }
    ctx.globalAlpha = 1;

    // Fade both edges to transparent by multiplying the drawn pixels' alpha
    // with a horizontal gradient (destination-in keeps only what the gradient
    // is opaque over), so bars dissolve at the edges instead of clipping.
    const fade = ctx.createLinearGradient(0, 0, width, 0);
    fade.addColorStop(0, "rgba(0,0,0,0)");
    fade.addColorStop(WAVEFORM_EDGE_FADE, "rgba(0,0,0,1)");
    fade.addColorStop(1 - WAVEFORM_EDGE_FADE, "rgba(0,0,0,1)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
  }

  async function finishDictation(audio: Blob) {
    if (discardNextRef.current) {
      discardNextRef.current = false;
      setDictationStatus("idle");
      return;
    }
    if (!audio.size) {
      setDictationStatus("idle");
      setDictationError("No audio was captured. Please try again.");
      return;
    }

    const controller = new AbortController();
    transcriptionAbortRef.current = controller;
    setDictationStatus("transcribing");

    try {
      const transcript = await transcribeAudio(audio, controller.signal);
      if (!transcript) throw new Error("No speech was detected.");

      setValue((current) => `${current}${current && !/\s$/.test(current) ? " " : ""}${transcript}`);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          resizeTextarea(textareaRef.current);
          textareaRef.current.focus();
        }
      });
      setDictationError(null);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setDictationError(error instanceof Error ? error.message : "Could not transcribe the recording.");
      }
    } finally {
      if (transcriptionAbortRef.current === controller) transcriptionAbortRef.current = null;
      setDictationStatus("idle");
    }
  }

  async function startDictation() {
    setDictationStatus("preparing");
    setDictationError(null);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setDictationStatus("idle");
      setDictationError("Microphone recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const mimeType = PREFERRED_AUDIO_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        recorder.onstop = null;
        chunksRef.current = [];
        recorderRef.current = null;
        stopWaveform();
        setDictationError("Microphone recording failed. Please try again.");
        setDictationStatus("idle");
        stopMediaStream();
      };
      recorder.onstop = () => {
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        recorderRef.current = null;
        stopWaveform();
        stopMediaStream();
        void finishDictation(audio);
      };
      recorder.start();
      startWaveform(stream);
      setDictationStatus("recording");
    } catch (error) {
      stopMediaStream();
      setDictationStatus("idle");
      setDictationError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone access was denied. Allow it in Chrome and try again."
          : "Caddie could not access the microphone.",
      );
    }
  }

  function handleDictation() {
    if (dictationStatus === "recording") {
      setDictationStatus("transcribing");
      recorderRef.current?.stop();
      return;
    }
    if (dictationStatus === "idle" && !busy && !disabled) void startDictation();
  }

  function cancelDictation() {
    if (dictationStatus !== "recording") return;
    discardNextRef.current = true;
    setDictationError(null);
    recorderRef.current?.stop();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const canSend = value.trim().length > 0;
  const micIsLoading = dictationStatus === "preparing" || dictationStatus === "transcribing";
  const micIsRed = dictationStatus === "recording" || dictationStatus === "transcribing";
  const micLabel =
    dictationStatus === "preparing"
      ? "Starting Mic"
      : dictationStatus === "recording"
        ? "Stop Dictation"
        : dictationStatus === "transcribing"
          ? "Processing"
          : "Dictate";

  if (dictationStatus === "recording" || dictationStatus === "transcribing") {
    const isTranscribing = dictationStatus === "transcribing";
    return (
      <div className="composer composer--dictating">
        <canvas ref={canvasRef} className="composer-waveform" aria-hidden="true" />

        <div className="composer-toolbar">
          <button
            type="button"
            className="composer-icon-btn composer-tooltip"
            aria-label="Attach"
            data-tooltip="Attach"
            disabled
          >
            <HugeiconsIcon icon={Add01Icon} size={20} />
          </button>

          <div className="composer-trailing">
            <button
              type="button"
              className="composer-dictation-btn composer-tooltip"
              aria-label="Cancel dictation"
              data-tooltip="Cancel"
              disabled={isTranscribing}
              onClick={cancelDictation}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={20} />
            </button>
            <button
              type="button"
              className={`composer-dictation-btn composer-tooltip${isTranscribing ? " composer-dictation-btn--busy" : ""}`}
              aria-label={isTranscribing ? "Processing" : "Stop dictation"}
              aria-busy={isTranscribing}
              data-tooltip={isTranscribing ? "Processing" : "Done"}
              disabled={isTranscribing}
              onClick={handleDictation}
            >
              {isTranscribing ? (
                <span className="composer-mic-loading-icon" aria-hidden="true">
                  <HugeiconsIcon icon={Loading03Icon} size={20} />
                </span>
              ) : (
                <HugeiconsIcon icon={Tick02Icon} size={20} />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="composer">
      <textarea
        ref={textareaRef}
        className="composer-textarea"
        placeholder="Ask anything"
        rows={1}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />

      <div className="composer-toolbar">
        <button
          type="button"
          className="composer-icon-btn composer-tooltip"
          aria-label="Attach"
          data-tooltip="Attach"
        >
          <HugeiconsIcon icon={Add01Icon} size={20} />
        </button>

        <div className="composer-trailing">
          <button
            type="button"
            className={`composer-icon-btn composer-tooltip${micIsRed ? " composer-icon-btn--recording" : ""}${micIsLoading ? " composer-icon-btn--loading" : ""}`}
            aria-label={dictationError && dictationStatus === "idle" ? `${micLabel}. ${dictationError}` : micLabel}
            aria-pressed={false}
            aria-busy={micIsLoading}
            data-tooltip={micLabel}
            disabled={disabled || busy || micIsLoading}
            onClick={handleDictation}
          >
            {micIsLoading ? (
              <span className="composer-mic-loading-icon" aria-hidden="true">
                <HugeiconsIcon icon={Loading03Icon} size={20} />
              </span>
            ) : (
              <HugeiconsIcon icon={Mic01Icon} size={20} />
            )}
          </button>
          <button
            type="button"
            className={`composer-send-btn composer-tooltip${busy ? " composer-send-btn--stop" : ""}`}
            aria-label={busy ? "Stop response" : "Send prompt"}
            data-tooltip={busy ? "Stop response" : "Send"}
            disabled={!busy && (disabled || !canSend || dictationStatus !== "idle")}
            onClick={handleSend}
          >
            {busy ? (
              <HugeiconsIcon icon={StopIcon} size={16} fill="currentColor" />
            ) : (
              <HugeiconsIcon icon={ArrowUp02Icon} size={20} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
