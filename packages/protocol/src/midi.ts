import {
  AudiframeError,
  type MidiEvent,
  type Manifest,
  type Grant,
} from "./types";
export function validateMidi(data: number[]): void {
  const status = data[0];
  const length =
    status < 0xf0
      ? status >= 0x80
        ? status >> 4 === 0xc || status >> 4 === 0xd
          ? 2
          : 3
        : 0
      : (
          {
            241: 2,
            242: 3,
            243: 2,
            246: 1,
            248: 1,
            250: 1,
            251: 1,
            252: 1,
            254: 1,
            255: 1,
          } as Record<number, number>
        )[status];
  if (
    !length ||
    data.length !== length ||
    !Number.isInteger(status) ||
    data.slice(1).some((x) => !Number.isInteger(x) || x < 0 || x > 127)
  )
    throw new AudiframeError("INVALID_VALUE", "Invalid MIDI short packet");
}
export function noteOn(note: number, velocity: number, channel = 1): number[] {
  if (!Number.isInteger(channel) || channel < 1 || channel > 16)
    throw new AudiframeError("INVALID_VALUE");
  const d = [(velocity === 0 ? 0x80 : 0x90) + channel - 1, note, velocity];
  validateMidi(d);
  return d;
}
export function noteOff(note: number, channel = 1): number[] {
  const d = noteOn(note, 0, channel);
  return d;
}
export function validatePorts(
  events: MidiEvent[],
  manifest: Manifest,
  grants: Grant[],
  direction: "in" | "out",
): void {
  const grant = grants.find(
    (g) => g.id === `midi.${direction === "in" ? "input" : "output"}`,
  );
  if (!grant) throw new AudiframeError("CAPABILITY_DENIED");
  for (const e of events) {
    validateMidi(e.data);
    if (
      !manifest.ports?.some(
        (p) =>
          p.id === e.portId && p.direction === direction && p.type === "midi1",
      ) ||
      (Array.isArray(grant.options?.ports) &&
        !grant.options.ports.includes(e.portId))
    )
      throw new AudiframeError("INVALID_PORT");
    if (
      e.data[0] >= 0xf0 &&
      !(
        Array.isArray(grant.options?.systemStatuses) &&
        grant.options.systemStatuses.includes(e.data[0])
      )
    )
      throw new AudiframeError(
        "CAPABILITY_DENIED",
        "System MIDI requires explicit grant",
      );
  }
}
export class MidiRouter {
  private seen = new Map<string, number>();
  private notes = new Map<string, MidiEvent>();
  route(events: MidiEvent[], route: string, now: number): MidiEvent[] {
    for (const [k, t] of this.seen) if (now - t > 30000) this.seen.delete(k);
    const result: MidiEvent[] = [];
    for (const e of events) {
      validateMidi(e.data);
      const key = `${route}:${e.id}`;
      if (this.seen.has(key) || (e.hops ?? 0) >= 8) continue;
      this.seen.set(key, now);
      if (this.seen.size > 4096)
        this.seen.delete(this.seen.keys().next().value!);
      const off =
        (e.data[0] & 0xf0) === 0x80 ||
        ((e.data[0] & 0xf0) === 0x90 && e.data[2] === 0);
      if (
        e.atMs !== undefined &&
        (e.atMs > now + 2000 || e.atMs < now - 250) &&
        !off
      )
        continue;
      const nk = `${route}:${e.portId}:${e.data[0] & 15}:${e.data[1]}`;
      if (off) this.notes.delete(nk);
      else if ((e.data[0] & 0xf0) === 0x90) this.notes.set(nk, e);
      result.push({
        ...e,
        routeId: route,
        hops: (e.hops ?? 0) + 1,
        ...(off && (e.atMs === undefined || e.atMs < now || e.atMs > now + 2000)
          ? { atMs: now }
          : {}),
      });
    }
    return result;
  }
  panic(): MidiEvent[] {
    const events = [...this.notes.values()].map((e) => ({
      ...e,
      id: crypto.randomUUID(),
      data: [0x80 | (e.data[0] & 15), e.data[1], 0],
      atMs: undefined,
    }));
    this.notes.clear();
    this.seen.clear();
    return events;
  }
}
