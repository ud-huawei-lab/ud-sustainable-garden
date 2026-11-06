import { useEffect, useRef, useState } from "react";
import {
  Maximize2,
  VideoOff,
  RotateCcw,
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipForward,
  Minimize2,
  Move,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cameras } from "../shared/catalog.js";
import Skeleton from "./Skeleton.jsx";

export function LivePlayer({ camera }) {
  const video = useRef(null);
  const container = useRef(null);
  const directionToggle = useRef(null);
  const liveEngine = useRef(null);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [clock, setClock] = useState("");
  const [expandError, setExpandError] = useState("");
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [panTilt, setPanTilt] = useState(false);
  const [directionOpen, setDirectionOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const closeDirection = () => {
    setDirectionOpen(false);
    requestAnimationFrame(() => directionToggle.current?.focus());
  };
  useEffect(() => {
    const controller = new AbortController();
    setPanTilt(false);
    fetch(`/api/cameras/${camera.id}/controls`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!controller.signal.aborted) setPanTilt(data?.panTilt === true);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [camera.id]);
  useEffect(() => {
    const changed = () =>
      setFullscreen(document.fullscreenElement === container.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  const changeDirection = async (direction) => {
    if (moving && direction !== "stop") return;
    if (direction !== "stop") setMoving(true);
    setExpandError("");
    try {
      const response = await fetch(`/api/cameras/${camera.id}/ptz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Direction control is unavailable.");
      }
    } catch (error) {
      setExpandError(error.message || "Direction control is unavailable.");
    } finally {
      if (direction !== "stop") setMoving(false);
    }
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await container.current.requestFullscreen();
      setExpandError("");
    } catch {
      setExpandError("Fullscreen is unavailable in this browser.");
    }
  };
  useEffect(() => {
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Dubai",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date()),
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const media = video.current;
    let hls;
    let recoveredMedia = false;
    setError(false);
    setPlaying(false);
    setBuffering(false);
    const fail = () => {
      if (!controller.signal.aborted) setError(true);
    };
    const timeout = setTimeout(fail, 45000);
    const onPlaying = () => {
      clearTimeout(timeout);
      setPlaying(true);
      setPaused(false);
      setBuffering(false);
      setError(false);
    };
    media.addEventListener("playing", onPlaying);
    media.addEventListener("error", fail);
    // Start loading the player and requesting the stream in parallel.
    Promise.all([
      import("hls.js"),
      fetch(`/api/cameras/${camera.id}/live`, {
        signal: controller.signal,
        cache: "no-store",
      }).then((r) => {
        if (!r.ok) throw new Error("Camera unavailable");
        return r.json();
      }),
    ])
      .then(([{ default: Hls }, { url }]) => {
        if (controller.signal.aborted) return;
        if (Hls.isSupported()) {
          hls = new Hls({
            lowLatencyMode: true,
            liveSyncDurationCount: 2,
            liveMaxLatencyDurationCount: 6,
            maxLiveSyncPlaybackRate: 1.15,
            maxBufferLength: 12,
            backBufferLength: 6,
            manifestLoadingTimeOut: 30000,
            levelLoadingTimeOut: 65000,
          });
          liveEngine.current = hls;
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (!data.fatal || controller.signal.aborted) return;
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMedia) {
              recoveredMedia = true;
              hls.recoverMediaError();
            } else {
              fail();
              hls.destroy();
            }
          });
          hls.attachMedia(media);
          hls.loadSource(url);
        } else if (media.canPlayType("application/vnd.apple.mpegurl")) {
          media.src = url;
        } else fail();
      })
      .catch(fail);
    return () => {
      controller.abort();
      clearTimeout(timeout);
      media.removeEventListener("playing", onPlaying);
      media.removeEventListener("error", fail);
      hls?.destroy();
      liveEngine.current = null;
      media.pause();
      media.removeAttribute("src");
      media.load();
    };
  }, [camera.id, attempt]);
  return (
    <article
      ref={container}
      className="camera-feed"
      aria-label={camera.name}
      data-paused={paused}
      data-direction-open={directionOpen && panTilt}
      onKeyDown={(event) => {
        if (event.key === "Escape" && directionOpen) closeDirection();
        if (
          directionOpen &&
          !["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)
        ) {
          const direction = {
            ArrowUp: "up",
            ArrowDown: "down",
            ArrowLeft: "left",
            ArrowRight: "right",
          }[event.key];
          if (direction) {
            event.preventDefault();
            if (!event.repeat) changeDirection(direction);
          }
        }
      }}
    >
      <video
        ref={video}
        autoPlay
        muted={muted}
        playsInline
        aria-label={`${camera.name} live feed`}
        onWaiting={() => setBuffering(true)}
        onStalled={() => setBuffering(true)}
        onPlay={() => setPaused(false)}
        onPause={() => {
          setPaused(true);
          setBuffering(false);
        }}
      />
      {!playing && !error && (
        <Skeleton kind="camera" label={`Loading ${camera.name}`} />
      )}
      {playing && buffering && !error && (
        <div
          className="feed-buffering"
          role="status"
          aria-label="Reconnecting video"
        >
          <span className="skeleton-block" />
        </div>
      )}
      {error && (
        <div className="feed-error" role="status">
          <VideoOff size={22} strokeWidth={1.4} />
          <span>Camera unavailable</span>
          <button
            className="feed-retry"
            onClick={() => setAttempt((v) => v + 1)}
          >
            <RotateCcw size={15} />
            Try again
          </button>
        </div>
      )}
      {playing && !error && (
        <div
          className="feed-controls"
          role="toolbar"
          aria-label={`${camera.name} playback controls`}
        >
          <button
            aria-label={`${paused ? "Play" : "Pause"} ${camera.name}`}
            title={paused ? "Play" : "Pause"}
            onClick={async () => {
              try {
                if (video.current.paused) await video.current.play();
                else video.current.pause();
                setExpandError("");
              } catch {
                setExpandError("Playback could not resume. Try again.");
              }
            }}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <div className="feed-volume">
            <button
              aria-label={`${muted ? "Unmute" : "Mute"} ${camera.name}`}
              title={muted ? "Unmute" : "Mute"}
              onClick={() => {
                if (muted && volume === 0) {
                  video.current.volume = 1;
                  setVolume(1);
                }
                video.current.muted = !muted;
                setMuted(!muted);
              }}
            >
              {muted || volume === 0 ? (
                <VolumeX size={16} />
              ) : (
                <Volume2 size={16} />
              )}
            </button>
            <div className="feed-volume-popover">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                aria-label={`${camera.name} volume`}
                aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)} percent`}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  video.current.volume = value;
                  video.current.muted = value === 0;
                  setVolume(value);
                  setMuted(value === 0);
                }}
              />
              <span>{Math.round((muted ? 0 : volume) * 100)}%</span>
            </div>
          </div>
          <button
            className="feed-live"
            aria-label={`Return ${camera.name} to live`}
            title="Return to live"
            onClick={async () => {
              const media = video.current;
              const target = liveEngine.current?.liveSyncPosition;
              if (Number.isFinite(target)) media.currentTime = target;
              else if (media.seekable.length)
                media.currentTime = Math.max(
                  media.seekable.start(media.seekable.length - 1),
                  media.seekable.end(media.seekable.length - 1) - 2,
                );
              try {
                await media.play();
              } catch {
                setExpandError("Playback could not resume. Try again.");
              }
            }}
          >
            <SkipForward size={14} />
            Live
          </button>
          <button
            aria-label={`${fullscreen ? "Exit fullscreen" : "Expand"} ${camera.name}`}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={toggleFullscreen}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      )}
      {playing && !error && panTilt && !directionOpen && (
        <button
          ref={directionToggle}
          className="feed-position-toggle"
          aria-label={`Camera direction ${camera.name}`}
          title={directionOpen ? "Close position controls" : "Pan and tilt"}
          aria-expanded={directionOpen}
          onClick={() => setDirectionOpen((value) => !value)}
        >
          <Move size={17} />
        </button>
      )}
      {panTilt && directionOpen && (
        <div
          className="feed-direction-panel"
          role="group"
          aria-label={`${camera.name} direction controls`}
          aria-busy={moving}
        >
          <span>Pan and tilt</span>
          <div className="direction-pad">
            {[
              ["up", ChevronUp],
              ["left", ChevronLeft],
              ["close", Minimize2],
              ["right", ChevronRight],
              ["down", ChevronDown],
            ].map(([direction, Icon]) => (
              <button
                key={direction}
                className={`direction-${direction}`}
                disabled={moving && direction !== "close"}
                title={
                  direction === "close" ? "Collapse PTZ" : `Nudge ${direction}`
                }
                aria-label={`${direction === "close" ? "Collapse PTZ" : `Nudge ${direction}`} ${camera.name}`}
                onClick={() =>
                  direction === "close"
                    ? closeDirection()
                    : changeDirection(direction)
                }
              >
                <Icon size={direction === "close" ? 14 : 17} />
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="feed-caption">
        <span>{camera.name}</span>
        <div>
          <time title="Current time in Dubai">{clock}</time>
        </div>
      </div>
      {expandError && (
        <span className="feed-notice" role="status">
          {expandError}
        </span>
      )}
    </article>
  );
}
export default function Cameras() {
  return (
    <section
      className="camera-grid clean-camera-grid"
      aria-label="Garden cameras"
    >
      {cameras.map((camera) => (
        <LivePlayer key={camera.id} camera={camera} />
      ))}
    </section>
  );
}
