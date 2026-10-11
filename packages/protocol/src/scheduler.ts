import {
  AudiframeError,
  type MidiEvent,
  type Timeline,
  type Manifest,
  type Grant,
  type Json,
} from "./types";
import { validateMidi } from "./midi";
import { assertSchema, type Schema } from "./schema";
export class MidiScheduler {
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private pendingNotes = new Map<string, Set<ReturnType<typeof setTimeout>>>();
  private seen = new Map<string, number>();
  private active = new Map<string, MidiEvent>();
  constructor(
    private deliver: (events: MidiEvent[]) => void,
    private now = () => performance.now(),
  ) {}
  enqueue(events: MidiEvent[], hostMinusLocalMs = 0): void {
    const now = this.now();
    for (const [id, t] of this.seen) if (now - t > 30000) this.seen.delete(id);
    for (const e of events) {
      validateMidi(e.data);
      if (this.seen.has(e.id)) continue;
      this.seen.set(e.id, now);
      if (this.seen.size > 4096)
        this.seen.delete(this.seen.keys().next().value!);
      const off =
        (e.data[0] & 0xf0) === 0x80 ||
        ((e.data[0] & 0xf0) === 0x90 && e.data[2] === 0);
      const due = e.atMs === undefined ? now : e.atMs - hostMinusLocalMs;
      const delay = due - now;
      if ((delay > 2000 || delay < -250) && !off) continue;
      const key = `${e.portId}:${e.data[0] & 15}:${e.data[1]}`;
      const send = () => {
        if (off) this.active.delete(key);
        else if ((e.data[0] & 0xf0) === 0x90) this.active.set(key, e);
        this.deliver([e]);
      };
      if (delay <= 0 || (off && delay > 2000)) {
        if (off) {
          for (const t of this.pendingNotes.get(key) ?? []) {
            clearTimeout(t);
            this.timers.delete(t);
          }
          this.pendingNotes.delete(key);
        }
        send();
      } else {
        if (this.timers.size >= 2048)
          throw new AudiframeError("QUOTA_EXCEEDED");
        const timer = setTimeout(() => {
          this.timers.delete(timer);
          this.pendingNotes.get(key)?.delete(timer);
          send();
        }, delay);
        this.timers.add(timer);
        if (!off && (e.data[0] & 0xf0) === 0x90) {
          const pending = this.pendingNotes.get(key) ?? new Set();
          pending.add(timer);
          this.pendingNotes.set(key, pending);
        }
      }
    }
  }
  flush(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.pendingNotes.clear();
    if (this.active.size)
      this.deliver(
        [...this.active.values()].map((e) => ({
          ...e,
          id: crypto.randomUUID(),
          data: [0x80 | (e.data[0] & 15), e.data[1], 0],
        })),
      );
    this.active.clear();
    this.seen.clear();
  }
}
export interface MusicalEvent {
  id: string;
  portId: string;
  eventType: string;
  data: Json;
  atMs?: number;
}
export function validateEvents(
  events: MusicalEvent[],
  manifest: Manifest,
  grants: Grant[],
  direction: "in" | "out",
): void {
  const grant = grants.find(
    (g) => g.id === `events.${direction === "in" ? "input" : "output"}`,
  );
  if (!grant) throw new AudiframeError("CAPABILITY_DENIED");
  const schemas = grant.options?.eventSchemas as unknown as
    | Record<string, Schema>
    | undefined;
  for (const e of events) {
    if (
      !manifest.ports?.some(
        (p) =>
          p.id === e.portId && p.type === "event" && p.direction === direction,
      ) ||
      (Array.isArray(grant.options?.ports) &&
        !grant.options.ports.includes(e.portId))
    )
      throw new AudiframeError("INVALID_PORT");
    if (
      !schemas ||
      !Object.hasOwn(schemas, e.eventType) ||
      !e.eventType.includes(".")
    )
      throw new AudiframeError("INVALID_VALUE", "Event type not negotiated");
    assertSchema(schemas[e.eventType], e.data);
  }
}
export function validateTimeline(t: Timeline): void {
  if (t.loop && t.loop.endBeats <= t.loop.startBeats)
    throw new AudiframeError("INVALID_VALUE", "Empty transport loop");
}
