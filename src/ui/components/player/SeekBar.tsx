import { useEffect, useRef } from "react";
import { usePlayerState } from "../../../player/playerStore";
import { playerController } from "../../../player/playerStore";
import { playerUIStore, usePlayerUIState } from "../../stores/playerUIStore";
import styles from "./SeekBar.module.css";

const PLAYING_REFRESH_MS = 500;
const PAUSED_REFRESH_MS = 1000;
const TIME_UPDATE_EPSILON_SEC = 0.05;
const DURATION_UPDATE_EPSILON_SEC = 0.25;

function formatTime(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function SeekBar() {
  const state = usePlayerState();
  const uiState = usePlayerUIState();

  const currentTimeElRef = useRef<HTMLSpanElement>(null);
  const durationElRef = useRef<HTMLSpanElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);

  const seekTargetRef = useRef(0);
  const seekAnimationRef = useRef<number | null>(null);
  const seekAnimationDoneRef = useRef<(() => void) | null>(null);
  const seekAnimationPromiseRef = useRef<Promise<void> | null>(null);
  const pendingSeekRef = useRef<{ target: number; startedAt: number } | null>(null);
  
  const displayedTimeRef = useRef(0);
  const durationRef = useRef(0);
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const isPointerDownRef = useRef(false);
  const isDraggingRef = useRef(false);

  const updateSliderUI = (time: number, dur: number) => {
    if (currentTimeElRef.current) {
      currentTimeElRef.current.textContent = formatTime(time);
    }
    if (durationElRef.current) {
      durationElRef.current.textContent = formatTime(dur);
    }
    if (sliderRef.current) {
      // Während des Ziehens nicht den value überschreiben, um Ruckeln zu vermeiden
      if (!isDraggingRef.current && !isPointerDownRef.current) {
        sliderRef.current.value = time.toString();
      }
      sliderRef.current.max = (dur || 100).toString();
      const percent = dur > 0 ? (time / dur) * 100 : 0;
      sliderRef.current.style.setProperty("--slider-progress", `${percent}%`);
    }
  };

  const setDisplayedTime = (time: number) => {
    if (Math.abs(displayedTimeRef.current - time) < TIME_UPDATE_EPSILON_SEC && displayedTimeRef.current !== 0) {
      return;
    }
    displayedTimeRef.current = time;
    updateSliderUI(time, durationRef.current);
  };

  const setDisplayedDuration = (nextDuration: number) => {
    if (Math.abs(durationRef.current - nextDuration) < DURATION_UPDATE_EPSILON_SEC && durationRef.current !== 0) {
      return;
    }
    durationRef.current = nextDuration;
    updateSliderUI(displayedTimeRef.current, nextDuration);
  };

  const cancelSeekAnimation = () => {
    if (seekAnimationRef.current !== null) {
      cancelAnimationFrame(seekAnimationRef.current);
      seekAnimationRef.current = null;
    }
    seekAnimationDoneRef.current?.();
    seekAnimationDoneRef.current = null;
    seekAnimationPromiseRef.current = null;
  };

  const animateTo = (target: number) => {
    cancelSeekAnimation();

    const start = displayedTimeRef.current;
    const startedAt = performance.now();
    const done = new Promise<void>((resolve) => {
      seekAnimationDoneRef.current = resolve;
    });
    seekAnimationPromiseRef.current = done;

    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 120);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayedTime(start + (target - start) * eased);

      if (progress < 1) {
        seekAnimationRef.current = requestAnimationFrame(animate);
      } else {
        seekAnimationRef.current = null;
        seekAnimationDoneRef.current?.();
        seekAnimationDoneRef.current = null;
        seekAnimationPromiseRef.current = null;
      }
    };

    seekAnimationRef.current = requestAnimationFrame(animate);
    return done;
  };

  useEffect(() => () => cancelSeekAnimation(), []);

  useEffect(() => {
    const hasTrack = Boolean(state.currentTrack);
    if (!hasTrack || state.status === "loading") {
      pendingSeekRef.current = null;
      setDisplayedTime(0);
      setDisplayedDuration(0);
      return;
    }

    const update = () => {
      if (!uiState.isSeeking) {
        const engineTime = playerController.getCurrentTime();
        const pendingSeek = pendingSeekRef.current;
        if (
          pendingSeek &&
          performance.now() - pendingSeek.startedAt < 750 &&
          Math.abs(engineTime - pendingSeek.target) > 0.75
        ) {
          setDisplayedTime(pendingSeek.target);
        } else {
          pendingSeekRef.current = null;
          setDisplayedTime(engineTime);
        }
        setDisplayedDuration(playerController.getDuration());
      }
    };

    update();
    if (uiState.isSeeking) return;

    const refreshMs = state.status === "playing" ? PLAYING_REFRESH_MS : PAUSED_REFRESH_MS;
    const intervalId = window.setInterval(update, refreshMs);
    return () => window.clearInterval(intervalId);
  }, [uiState.isSeeking, state.currentTrack, state.status]);

  const handleSeekStart = (event: React.PointerEvent<HTMLInputElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    isPointerDownRef.current = true;
    isDraggingRef.current = false;
    seekTargetRef.current = displayedTimeRef.current;
    playerUIStore.setSeeking(true);
  };

  const handleSeekMove = (event: React.PointerEvent<HTMLInputElement>) => {
    if (!isPointerDownRef.current || isDraggingRef.current) return;

    const distance = Math.hypot(
      event.clientX - pointerStartRef.current.x,
      event.clientY - pointerStartRef.current.y
    );
    if (distance < 3) return;

    isDraggingRef.current = true;
    cancelSeekAnimation();
    const target = Number(event.currentTarget.value);
    seekTargetRef.current = target;
    setDisplayedTime(target);
  };

  const handleSeekEnd = async (_event: React.PointerEvent<HTMLInputElement>) => {
    const wasDragging = isDraggingRef.current;
    isPointerDownRef.current = false;
    isDraggingRef.current = false;
    const seekTime = seekTargetRef.current;
    const animationDone = wasDragging
      ? Promise.resolve()
      : (seekAnimationPromiseRef.current ?? Promise.resolve());

    try {
      pendingSeekRef.current = { target: seekTime, startedAt: performance.now() };
      await Promise.all([playerController.seekTo(seekTime), animationDone]);
    } finally {
      playerUIStore.setSeeking(false);
    }
  };

  const handleSeekCancel = () => {
    isPointerDownRef.current = false;
    isDraggingRef.current = false;
    cancelSeekAnimation();
    playerUIStore.setSeeking(false);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = parseFloat(e.target.value);
    seekTargetRef.current = target;

    if (isDraggingRef.current || !isPointerDownRef.current) {
      cancelSeekAnimation();
      setDisplayedTime(target);
      return;
    }

    void animateTo(target);
  };

  const commitKeyboardSeek = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
      return;
    }
    const seekTime = seekTargetRef.current;
    pendingSeekRef.current = { target: seekTime, startedAt: performance.now() };
    void playerController.seekTo(seekTime);
  };

  const isDisabled = !state.currentTrack || state.status === "loading";

  return (
    <div className={styles.seekBar}>
      <span ref={currentTimeElRef} className={styles.timeDisplay}>
        0:00
      </span>
      <input
        ref={sliderRef}
        type="range"
        min="0"
        max="100"
        step="any"
        defaultValue={0}
        onChange={handleSeekChange}
        onKeyUp={commitKeyboardSeek}
        onPointerDown={handleSeekStart}
        onPointerMove={handleSeekMove}
        onPointerUp={(event) => void handleSeekEnd(event)}
        onPointerCancel={handleSeekCancel}
        disabled={isDisabled}
        className={styles.seekSlider}
        aria-label="Seek"
      />
      <span ref={durationElRef} className={styles.timeDisplay}>
        0:00
      </span>
    </div>
  );
}