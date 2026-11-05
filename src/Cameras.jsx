import { useEffect, useRef, useState } from "react";
import { Maximize2, X, Cctv } from "lucide-react";
import { cameras } from "../shared/catalog.js";
import { Panel } from "./Weather.jsx";

export function LivePlayer({ camera }) {
  const video = useRef(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let hls;
    fetch(`/api/cameras/${camera.id}/live`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(async ({ url }) => {
        const { default: Hls } = await import("hls.js");
        if (controller.signal.aborted) return;
        if (Hls.isSupported()) {
          hls = new Hls({
            maxBufferLength: 15,
            manifestLoadingTimeOut: 65000,
            levelLoadingTimeOut: 65000,
          });
          hls.loadSource(url);
          hls.attachMedia(video.current);
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              setError(
                "Live video is unavailable. The latest camera image is shown below.",
              );
              hls.destroy();
            }
          });
        } else if (video.current.canPlayType("application/vnd.apple.mpegurl"))
          video.current.src = url;
        else
          setError(
            "This browser cannot play this camera stream. The latest image is shown below.",
          );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Live video is unavailable. The latest camera image is shown below.",
          );
      });
    const timeout = setTimeout(() => {
      setLoading(false);
      setError(
        (previous) =>
          previous ||
          (!video.current?.readyState
            ? "Live video did not load. The latest camera image is shown below."
            : ""),
      );
    }, 70000);
    return () => {
      controller.abort();
      clearTimeout(timeout);
      hls?.destroy();
    };
  }, [camera.id]);
  return (
    <div className="live-player">
      {loading && !error && <p className="secondary">Opening camera…</p>}
      {error ? (
        <>
          <p>{error}</p>
          <img
            src={`/api/cameras/${camera.id}/snapshot`}
            alt={`${camera.name} latest camera image`}
          />
        </>
      ) : (
        <video
          ref={video}
          autoPlay
          muted
          controls
          playsInline
          poster={`/api/cameras/${camera.id}/snapshot`}
          onLoadedData={() => setLoading(false)}
          onError={() =>
            setError(
              "Live video could not play. The latest camera image is shown below.",
            )
          }
        />
      )}
    </div>
  );
}
export default function Cameras() {
  const [selected, setSelected] = useState(null);
  const dialog = useRef(null);
  useEffect(() => {
    if (selected && !dialog.current.open) dialog.current.showModal();
  }, [selected]);
  return (
    <>
      <Panel id="cameras" className="cameras-panel">
        <div className="section-top">
          <div>
            <h2>Garden cameras</h2>
            <p className="secondary">
              Live streams from both garden cameras. Select a view to expand it.
            </p>
          </div>
        </div>
        <div className="camera-grid">
          {cameras.map((camera) => (
            <article className="camera-tile" key={camera.id}>
              <LivePlayer camera={camera} />
              <div className="camera-caption">
                <h3>
                  <Cctv size={18} />
                  {camera.name}
                </h3>
                <button
                  className="quiet-button"
                  onClick={() => setSelected(camera)}
                  aria-label={`Expand ${camera.name}`}
                >
                  <Maximize2 size={15} />
                  Expand view
                </button>
              </div>
            </article>
          ))}
        </div>
      </Panel>
      <dialog
        ref={dialog}
        className="camera-dialog"
        onClose={() => setSelected(null)}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current.close();
        }}
      >
        {selected && (
          <>
            <div className="dialog-heading">
              <h2>{selected.name}</h2>
              <button
                className="icon-button"
                aria-label="Close camera"
                onClick={() => dialog.current.close()}
              >
                <X size={20} />
              </button>
            </div>
            <LivePlayer key={selected.id} camera={selected} />
          </>
        )}
      </dialog>
    </>
  );
}
