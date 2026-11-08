import { useEffect, useState } from "react";

/** One expiry of the latest fit, as /api/calibrations/latest returns it. */
export interface CalibrationExpiry {
  expiry: string; // YYYY-MM-DD
  time: number; // years
  forward: number;
  strikes: number[];
  marketIv: number[];
  modelIv: (number | null)[]; // null where the model price has no implied volatility
}

export interface Calibration {
  date: string; // New York trade date
  fittedAt: string;
  spot: number;
  params: { vol0: number; longVol: number; kappa: number; xi: number; rho: number };
  rmseIv: number;
  quotesUsed: number;
  atBound: string[];
  expiries: CalibrationExpiry[];
}

/** One day of /api/calibrations: the fit without its per-expiry points. */
export type FitSummary = Omit<Calibration, "expiries" | "fittedAt">;

export interface RunStatus {
  status: "running" | "ok" | "rejected" | "failed";
  date: string | null;
  finishedAt: string | null;
  message: string | null;
}

export type CalibrationState =
  | { kind: "loading" }
  | { kind: "ready"; fit: Calibration | null; history: FitSummary[]; lastRun: RunStatus | null }
  | { kind: "unavailable" }; // no API (the site can run without one) or it errored

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const type = res.headers.get("content-type") ?? "";
  // Without an API behind /api, the static server answers 404 with no JSON.
  if (!type.includes("application/json")) throw new Error(`${url}: no JSON (${res.status})`);
  return { status: res.status, body: await res.json() };
}

async function load(): Promise<CalibrationState> {
  try {
    const [latest, health, past] = await Promise.all([
      getJson("/api/calibrations/latest"),
      getJson("/api/health"),
      getJson(`/api/calibrations?limit=${HISTORY_DAYS}`),
    ]);
    // 404: no fit has succeeded yet; 503: the job has never run.
    const fit = latest.status === 200 ? (latest.body as Calibration) : null;
    if (fit === null && latest.status !== 404 && latest.status !== 503) return { kind: "unavailable" };
    const lastRun = (health.body as { lastRun: RunStatus | null }).lastRun ?? null;
    // The API lists newest first; charts read left to right in time.
    const history = past.status === 200 ? (past.body as FitSummary[]).slice().reverse() : [];
    return { kind: "ready", fit, history, lastRun };
  } catch {
    return { kind: "unavailable" };
  }
}

// About six months of weekdays.
const HISTORY_DAYS = 130;

// Fits change once a day, so one request per page load is plenty.
let pending: Promise<CalibrationState> | null = null;

/** The latest market fit, fetched the first time it's wanted. */
export function useCalibration(wanted: boolean): CalibrationState {
  const [state, setState] = useState<CalibrationState>({ kind: "loading" });
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    pending ??= load();
    pending.then((s) => live && setState(s));
    return () => {
      live = false;
    };
  }, [wanted]);
  return state;
}
