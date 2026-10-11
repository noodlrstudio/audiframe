import type { Timeline } from "./types";
export interface ClockSample {
  offsetMs: number;
  rttMs: number;
  uncertaintyMs: number;
}
export function clockSample(
  t0: number,
  t1: number,
  t2: number,
  t3: number,
): ClockSample {
  const rttMs = Math.max(0, t3 - t0 - (t2 - t1));
  return {
    offsetMs: (t1 - t0 + (t2 - t3)) / 2,
    rttMs,
    uncertaintyMs: rttMs / 2,
  };
}
export async function syncClock(
  ping: (
    sentAtMs: number,
  ) => Promise<{ receivedAtMs: number; sentAtMs: number }>,
  now = () => performance.now(),
): Promise<ClockSample> {
  const samples: ClockSample[] = [];
  for (let i = 0; i < 3; i++) {
    const t0 = now();
    const r = await ping(t0);
    samples.push(clockSample(t0, r.receivedAtMs, r.sentAtMs, now()));
  }
  return samples.sort((a, b) => a.rttMs - b.rttMs)[0];
}
export function positionAt(
  t: Timeline,
  hostMs: number,
): { seconds: number; beats: number } {
  const elapsed =
    t.state === "playing" ? Math.max(0, hostMs - t.effectiveAtMs) / 1000 : 0;
  let beats = t.positionBeats + (elapsed * t.bpm) / 60;
  if (t.loop && beats >= t.loop.endBeats)
    beats =
      t.loop.startBeats +
      ((beats - t.loop.startBeats) % (t.loop.endBeats - t.loop.startBeats));
  return { seconds: t.positionSeconds + elapsed, beats };
}
export function toAudioTime(
  hostMs: number,
  offsetMs: number,
  localMs: number,
  audioSeconds: number,
): number {
  return audioSeconds + (hostMs + offsetMs - localMs) / 1000;
}
