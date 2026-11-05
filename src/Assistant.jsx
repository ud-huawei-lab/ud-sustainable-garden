import { useEffect, useRef, useState } from "react";
import { Cctv, ChevronDown, SendHorizontal, RotateCcw } from "lucide-react";
import { cameras } from "../shared/catalog.js";
import Skeleton from "./Skeleton.jsx";
import { time } from "./data.js";

const count = (value) =>
  Number.isFinite(value) ? new Intl.NumberFormat("en-US").format(value) : "—";
export default function Assistant() {
  const [open, setOpen] = useState(false);
  const scrollBox = useRef(null);
  const follow = useRef(true);
  const request = useRef(null);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const [windowSize, setWindowSize] = useState(32768);
  const [camera, setCamera] = useState("trees");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (follow.current && scrollBox.current)
      scrollBox.current.scrollTop = scrollBox.current.scrollHeight;
  }, [messages, busy, error, open]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch("/api/ai/models", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Models could not be loaded.");
        return data;
      })
      .then((data) => {
        setModels(data.models);
        setWindowSize(data.contextWindow);
        setModel(
          data.models.find((m) => m.name === data.defaultModel && m.vision)
            ?.name ||
            data.models.find((m) => m.vision)?.name ||
            "",
        );
        setError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => () => request.current?.abort(), []);
  const selected = models.find((m) => m.name === model);
  const capacity =
    result?.context.window ||
    Math.min(windowSize, selected?.maxContext || windowSize);
  const used = result?.context.used;
  const ratio = used == null ? 0 : Math.min(1, used / capacity);
  const reset = () => {
    setMessages([]);
    setResult(null);
    setError("");
  };
  const analyze = async (event) => {
    event.preventDefault();
    if (busy || !model) return;
    const prompt =
      question.trim() ||
      "Describe what you can see and any clear changes between the frames.";
    const controller = new AbortController();
    request.current = controller;
    follow.current = true;
    setOpen(true);
    setBusy(true);
    setError("");
    setMessages((previous) =>
      [...previous, { role: "user", content: prompt }].slice(-40),
    );
    setQuestion("");
    try {
      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          camera,
          model,
          question: prompt,
          history: messages
            .slice(-6)
            .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Camera analysis could not complete.");
      setResult(data);
      setMessages((previous) =>
        [...previous, { role: "assistant", content: data.answer }].slice(-40),
      );
      setQuestion("");
    } catch (error) {
      if (!controller.signal.aborted) setError(error.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return (
    <section className="garden-chat" aria-label="Garden assistant">
      {(open || error) && (
        <div className="chat-panel">
          <header>
            <span>
              Garden assistant · {cameras.find((c) => c.id === camera)?.name}
            </span>
            <div>
              <button
                className="icon-button"
                title="New session"
                aria-label="New analysis session"
                disabled={busy || !messages.length}
                onClick={reset}
              >
                <RotateCcw size={15} />
              </button>
              <button
                className="icon-button"
                title="Collapse conversation"
                aria-label="Collapse garden conversation"
                onClick={() => setOpen(false)}
              >
                <ChevronDown size={17} />
              </button>
            </div>
          </header>
          <div
            ref={scrollBox}
            className="chat-scroll"
            tabIndex={0}
            role="region"
            aria-label="Conversation history"
            onScroll={(event) => {
              const el = event.currentTarget;
              follow.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 32;
            }}
          >
            {error && (
              <div className="assistant-error" role="alert">
                <p>{error}</p>
                {!models.length && !loading && (
                  <button
                    className="quiet-button"
                    onClick={() => setRetry((v) => v + 1)}
                  >
                    Reload models
                  </button>
                )}
              </div>
            )}
            <div
              className="assistant-conversation"
              aria-live="polite"
              aria-busy={busy}
            >
              {messages.map((message, i) => (
                <div
                  className={"assistant-message message-" + message.role}
                  key={i}
                >
                  <span>
                    {message.role === "user" ? "You" : "Garden assistant"}
                  </span>
                  <p>{message.content}</p>
                </div>
              ))}
              {busy && (
                <Skeleton
                  kind="answer"
                  label="Analyzing recent camera frames"
                />
              )}
              {!busy && !messages.length && !error && (
                <p className="assistant-note">
                  Ask about the current camera view. Analysis uses three recent
                  frames.
                </p>
              )}
            </div>
            {result && (
              <p className="analysis-source">
                {result.frameCount} frames ·{" "}
                {time(result.capturedAt[0], { second: "2-digit" })}–
                {time(result.capturedAt.at(-1), { second: "2-digit" })} Dubai ·{" "}
                {result.model}
                {Number.isFinite(result.inferenceSeconds)
                  ? " · Model " + result.inferenceSeconds + "s · Thinking off"
                  : ""}
              </p>
            )}
          </div>
        </div>
      )}
      <form className="chat-composer" onSubmit={analyze}>
        <div className="chat-input-row">
          <textarea
            aria-label="Ask about the current camera view"
            maxLength={1000}
            value={question}
            disabled={busy || loading}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask the garden"
            rows={1}
          />
        </div>
        <div className="chat-options">
          <select
            aria-label="AI model"
            title="Vision model"
            value={model}
            disabled={busy || loading || !models.length}
            onChange={(event) => {
              setModel(event.target.value);
              reset();
            }}
          >
            {loading && <option>Loading models…</option>}
            {models.map((m) => (
              <option value={m.name} key={m.name} disabled={!m.vision}>
                {m.name} · {(m.sizeBytes / 1e9).toFixed(1)} GB
                {!m.vision ? " · text only" : ""}
              </option>
            ))}
          </select>
          <details className="chat-settings">
            <summary
              aria-label="Camera and model settings"
              title="Camera and model settings"
            >
              <Cctv size={16} />
            </summary>
            <div className="chat-settings-popover">
              <label>
                Camera
                <select
                  value={camera}
                  disabled={busy}
                  onChange={(event) => {
                    setCamera(event.target.value);
                    reset();
                  }}
                >
                  {cameras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <details className="assistant-models">
                <summary>Installed models · {models.length}</summary>
                <ul>
                  {models.map((m) => (
                    <li key={m.name}>
                      <strong>{m.name}</strong>
                      <span>
                        {(m.sizeBytes / 1e9).toFixed(1)} GB ·{" "}
                        {count(m.maxContext)} tokens ·{" "}
                        {m.vision ? "Vision" : "Text only"}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
              <p>Uses three recent frames.</p>
            </div>
          </details>
          <details className="context-details">
            <summary
              aria-label="Session context usage"
              title={
                "Context: " +
                (used == null ? "not measured" : count(used)) +
                " / " +
                count(capacity) +
                " tokens"
              }
            >
              <svg
                width="27"
                height="27"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  fill="none"
                  stroke="var(--line)"
                  strokeWidth="2"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  fill="none"
                  stroke={
                    ratio < 0.5
                      ? "#3cd779"
                      : ratio < 0.8
                        ? "#ffc347"
                        : "#ff5a63"
                  }
                  strokeWidth="2"
                  strokeDasharray={56.55}
                  strokeDashoffset={56.55 * (1 - ratio)}
                  transform="rotate(-90 12 12)"
                />
                <text
                  x="12"
                  y="14"
                  textAnchor="middle"
                  fill="currentColor"
                  fontSize="6.5"
                >
                  {used == null ? "—" : Math.round(ratio * 100) + "%"}
                </text>
              </svg>
            </summary>
            <div className="context-popover">
              <strong>Session context · {model || "No model"}</strong>
              <p>
                {used == null ? "Not measured" : count(used)} /{" "}
                {count(capacity)} tokens
              </p>
              <p>
                {selected
                  ? count(selected.maxContext) + " token model maximum"
                  : "Choose a vision model"}
              </p>
              <p>
                {result
                  ? "Input " +
                    count(result.context.promptTokens) +
                    " · Output " +
                    count(result.context.outputTokens)
                  : "Usage appears after analysis"}
              </p>
              <p>Thinking off · Last three exchanges sent to model</p>
            </div>
          </details>
          <button
            className="chat-send icon-button"
            aria-label={busy ? "Analyzing camera view" : "Analyze view"}
            title="Analyze current camera view"
            disabled={busy || loading || !model}
            type="submit"
          >
            <SendHorizontal size={18} />
          </button>
          {messages.length > 0 && !open && (
            <button
              className="icon-button"
              type="button"
              aria-label="Show garden conversation"
              onClick={() => setOpen(true)}
            >
              <ChevronDown size={16} style={{ transform: "rotate(180deg)" }} />
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
