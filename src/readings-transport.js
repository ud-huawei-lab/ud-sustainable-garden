// Streaming is primary. HTTP reads keep values fresh if a hosting proxy buffers SSE.
export function connectReadings({
  onData,
  onError,
  onUnauthorized,
  fetchImpl = fetch,
  EventSourceImpl = EventSource,
}) {
  const controller = new AbortController();
  const stream = new EventSourceImpl("/api/events");
  let polling = null;
  let busy = false;
  let initialFallback;
  const stopPolling = () => {
    clearInterval(polling);
    polling = null;
    clearTimeout(initialFallback);
  };
  const close = () => {
    controller.abort();
    stopPolling();
    stream.close();
  };
  const endSession = () => {
    close();
    onUnauthorized();
  };
  const refresh = async () => {
    if (busy || controller.signal.aborted) return;
    busy = true;
    try {
      const response = await fetchImpl("/api/readings", {
        signal: controller.signal,
        cache: "no-store",
      });
      if (response.status === 401) {
        endSession();
        return;
      }
      const data = response.headers
        .get("content-type")
        ?.includes("application/json")
        ? await response.json()
        : null;
      if (
        !response.ok ||
        !data?.entities ||
        typeof data.entities !== "object" ||
        Array.isArray(data.entities)
      )
        throw new Error(
          data?.error ||
            "The readings service could not be reached. Try reconnecting.",
        );
      if (!controller.signal.aborted) onData(data);
    } catch (error) {
      if (!controller.signal.aborted)
        onError(
          error.message ||
            "The readings service could not be reached. Try reconnecting.",
        );
    } finally {
      busy = false;
    }
  };
  const startPolling = () => {
    if (polling || controller.signal.aborted) return;
    refresh();
    polling = setInterval(refresh, 1000);
  };
  stream.addEventListener("session-ended", endSession);
  stream.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    if (data.error) {
      onError(data.error);
      startPolling();
      return;
    }
    if (
      !data.entities ||
      typeof data.entities !== "object" ||
      Array.isArray(data.entities)
    )
      return;
    stopPolling();
    onData(data);
  };
  stream.onerror = () => {
    startPolling();
  };
  initialFallback = setTimeout(startPolling, 10000);
  refresh();
  return close;
}
