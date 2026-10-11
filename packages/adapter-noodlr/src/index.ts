import {
  AudiframeError,
  validateMidi,
  noteOn,
  noteOff,
  type Snapshot,
  type Json,
  type Lifecycle,
} from "@audiframe/protocol";
export const descriptor = {
  adapterId: "org.audiframe.adapter-noodlr",
  adapterVersion: "0.1.0-alpha.1",
  sourceFormat: "noodlr:plugin",
  sourceVersion: "2",
  sourceCommit: "1ebab86f7dc65bbd53b31ebb640d4deb824a2379",
  mappedCapabilities: [
    "midi.input",
    "midi.output",
    "lifecycle",
    "state.snapshot",
  ],
  limitations: [
    "Legacy v2 has no atomic restore acknowledgement: never report state conformance.",
    "Legacy timestamps are not a shared clock: normalize to immediate delivery.",
    "State conversion is explicit and source-retaining; no asset portability claim.",
    "No transport or parameter support is inferred.",
  ],
};
export const v1Descriptor = {
  ...descriptor,
  adapterId: "org.audiframe.adapter-noodlr-midi-v1",
  sourceFormat: "noodlr:midi",
  sourceVersion: "1",
  mappedCapabilities: ["midi.input", "midi.output"],
  limitations: [
    "No inferred state, parameters or transport.",
    "Runtime cooperation cannot prove audio unlocked.",
  ],
};
/** Explicit conversion only. The caller retains the original legacy envelope. */
export function convertLegacySnapshot(value: Json, schemaId: string): Snapshot {
  const v = value as {
    pluginId?: string;
    schemaVersion?: number;
    state?: Json;
  };
  if (
    !v ||
    v.schemaVersion !== 1 ||
    typeof v.pluginId !== "string" ||
    v.state === undefined
  )
    throw new AudiframeError("STATE_SCHEMA_UNSUPPORTED");
  return {
    appId: v.pluginId,
    schemaId,
    schemaVersion: 1,
    data: structuredClone(v.state),
  };
}
export function legacyRuntime(policy: Lifecycle) {
  return {
    isEnabled: policy.enabled && policy.mode === "active",
    isMuted: !policy.audible,
    isSoloed: false,
    isArmed: policy.midiOutputEnabled,
    isAudible: policy.audible && policy.enabled && policy.mode === "active",
    shouldRecord: false,
  };
}
export function legacyPacket(data: number[], portId: string, hostNow: number) {
  validateMidi(data);
  return { portId, data: [...data], timestamp: hostNow };
}
export function legacyNote(event: {
  type: "noteon" | "noteoff";
  note: number;
  velocity: number;
  channel: number;
}): number[] {
  return event.type === "noteon"
    ? noteOn(event.note, event.velocity, event.channel)
    : noteOff(event.note, event.channel);
}
