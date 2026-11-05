import { useEffect, useState } from "react";
import { connectReadings } from "./readings-transport.js";
export const number = (value) =>
  value == null ||
  String(value).trim() === "" ||
  !Number.isFinite(Number(value))
    ? null
    : Number(value);
export const format = (value, decimals = 1) =>
  number(value) == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals,
      }).format(number(value));
export const time = (value, options = {}) =>
  !value || !Number.isFinite(new Date(value).getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dubai",
        hour: "2-digit",
        minute: "2-digit",
        ...options,
      }).format(new Date(value));
export const bearing = (value) =>
  number(value) == null
    ? "—"
    : [
        "N",
        "NNE",
        "NE",
        "ENE",
        "E",
        "ESE",
        "SE",
        "SSE",
        "S",
        "SSW",
        "SW",
        "WSW",
        "W",
        "WNW",
        "NW",
        "NNW",
      ][Math.round(Number(value) / 22.5) % 16];
export const getNumber = (entities, id) => number(entities?.[id]?.state);
export const read = (entities, id, decimals = 1) =>
  format(getNumber(entities, id), decimals);
export function useReadings() {
  const [state, setState] = useState({
    entities: {},
    error: "",
    fetchedAt: null,
    grafanaUrl: "",
  });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const accept = (data) =>
      setState((previous) =>
        data.error
          ? { ...previous, error: data.error }
          : { ...previous, ...data, error: "" },
      );
    return connectReadings({
      onData: accept,
      onError: (error) => setState((previous) => ({ ...previous, error })),
      onUnauthorized: () =>
        window.dispatchEvent(new Event("garden-session-ended")),
    });
  }, [retry]);
  return { ...state, retry: () => setRetry((v) => v + 1) };
}
