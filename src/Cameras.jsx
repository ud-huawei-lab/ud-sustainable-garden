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
} from "lucide-react";
import { cameras } from "../shared/catalog.js";
import Skeleton from "./Skeleton.jsx";

export function LivePlayer({ camera }) {
  const video = useRef(null);
  const container = useRef(null);
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
    <article ref={container} className="camera-feed" aria-label={camera.name}>
      <video
        ref={video}
        autoPlay
        muted={muted}
        playsInline
        aria-label={`${camera.name} live feed`}
        onWaiting={() => setBuffering(true)}
        onStalled={() => setBuffering(true)}
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
          <button
            aria-label={`${muted ? "Unmute" : "Mute"} ${camera.name}`}
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
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={muted ? 0 : volume}
            aria-label={`${camera.name} volume`}
            onChange={(event) => {
              const value = Number(event.target.value);
              video.current.volume = value;
              video.current.muted = value === 0;
              setVolume(value);
              setMuted(value === 0);
            }}
          />
          <button
            className="feed-live"
            aria-label={`Return ${camera.name} to live`}
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
        </div>
      )}
      <div className="feed-caption">
        <span>{camera.name}</span>
        <div>
          <time title="Current time in Dubai">{clock}</time>
          <button
            aria-label={`Expand ${camera.name}`}
            title="Fullscreen"
            onClick={async () => {
              try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await container.current.requestFullscreen();
                setExpandError("");
              } catch {
                setExpandError("Fullscreen is unavailable in this browser.");
              }
            }}
          >
            <Maximize2 size={16} />
          </button>
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
