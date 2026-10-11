import {
  arr,
  obj,
  str,
  num,
  uint,
  bool,
  en,
  snapshotSchema,
  grantSchema,
  type Schema,
} from "./schema";
export interface Operation {
  sender: "host" | "client" | "either";
  kind: "request" | "notification";
  capability?: string;
  input: Schema;
  output?: Schema;
}
const empty = obj({});
const values = arr(obj({ id: str, value: num }));
const midi = obj(
  {
    id: str,
    portId: str,
    data: arr({ type: "integer", minimum: 0, maximum: 255 }, 3),
    atMs: num,
    routeId: str,
    hops: uint,
  },
  ["id", "portId", "data"],
);
export const lifecycleSchema = obj(
  {
    mode: en("active", "suspended", "dispose"),
    enabled: bool,
    audible: bool,
    midiOutputEnabled: bool,
    visible: bool,
    stateEpoch: str,
  },
  ["mode", "enabled", "audible", "midiOutputEnabled", "visible"],
);
export const timelineSchema = obj({
  timelineId: str,
  discontinuity: uint,
  state: en("stopped", "playing", "paused"),
  capturedAtMs: num,
  effectiveAtMs: num,
  positionSeconds: num,
  positionBeats: num,
  bpm: { type: "number", minimum: 0.001 },
  timeSignature: obj({
    numerator: { type: "integer", minimum: 1, maximum: 32 },
    denominator: { type: "integer", enum: [1, 2, 4, 8, 16, 32] },
  }),
  loop: { oneOf: [{ type: "null" }, obj({ startBeats: num, endBeats: num })] },
});
export const parameterSchema = obj(
  {
    id: str,
    label: str,
    type: en("float", "int", "bool", "enum"),
    minValue: num,
    maxValue: num,
    defaultValue: num,
    unit: str,
    step: { type: "number", minimum: 0.000001 },
    choices: arr(obj({ value: num, label: str })),
    automatable: bool,
    readOnly: bool,
  },
  [
    "id",
    "label",
    "type",
    "minValue",
    "maxValue",
    "defaultValue",
    "automatable",
    "readOnly",
  ],
);
const req = (
  sender: Operation["sender"],
  capability: string | undefined,
  input: Schema,
  output: Schema,
): Operation => ({ sender, capability, kind: "request", input, output });
const note = (
  sender: Operation["sender"],
  capability: string | undefined,
  input: Schema,
): Operation => ({ sender, capability, kind: "notification", input });
const file = obj({ transferId: str, name: str, mimeType: str, size: uint });
export const OPERATIONS: Record<string, Operation> = {
  "session/ready": note(
    "client",
    undefined,
    obj({ acceptedGrants: arr(str, 32) }),
  ),
  "session/grants": note(
    "host",
    undefined,
    obj({ grants: arr(grantSchema, 32), reason: str }),
  ),
  "session/ping": req(
    "either",
    undefined,
    obj({ sentAtMs: num }),
    obj({ receivedAtMs: num, sentAtMs: num }),
  ),
  "session/close": note("either", undefined, obj({ reason: str })),
  "request/cancel": note("either", undefined, obj({ requestId: str })),
  "state/get": req(
    "host",
    "state.snapshot",
    empty,
    obj({ snapshot: snapshotSchema, revision: uint }),
  ),
  "state/set": req(
    "host",
    "state.snapshot",
    obj({ snapshot: snapshotSchema, epoch: str }),
    obj({ revision: uint, epoch: str }),
  ),
  "state/changed": note(
    "client",
    "state.snapshot",
    obj({ snapshot: snapshotSchema, revision: uint, epoch: str }),
  ),
  "midi/batch": note("either", "midi", obj({ events: arr(midi) })),
  "events/batch": note(
    "either",
    "events",
    obj({
      events: arr(
        obj({ id: str, portId: str, eventType: str, data: {}, atMs: num }, [
          "id",
          "portId",
          "eventType",
          "data",
        ]),
      ),
    }),
  ),
  "transport/update": note("host", "transport.follow", timelineSchema),
  "transport/request": req(
    "client",
    "transport.request",
    obj(
      {
        action: en("play", "pause", "stop", "seek", "tempo"),
        positionBeats: num,
        bpm: { type: "number", minimum: 0.001 },
      },
      ["action"],
    ),
    obj({ accepted: bool }),
  ),
  "parameters/list": req(
    "host",
    "parameters",
    empty,
    obj({ descriptors: arr(parameterSchema), revision: uint }),
  ),
  "parameters/get": req(
    "host",
    "parameters",
    obj({ ids: arr(str) }),
    obj({ values, revision: uint }),
  ),
  "parameters/set": req(
    "host",
    "parameters",
    obj({ changes: values, atMs: num, gestureId: str }, ["changes"]),
    obj({ values, revision: uint }),
  ),
  "parameters/changed": note(
    "client",
    "parameters",
    obj({ values, revision: uint, gestureId: str }, ["values", "revision"]),
  ),
  "parameters/gesture": note(
    "either",
    "parameters",
    obj({ id: str, gestureId: str, phase: en("begin", "end") }),
  ),
  "lifecycle/set": req(
    "host",
    "lifecycle",
    lifecycleSchema,
    obj({
      applied: bool,
      audioStatus: en("locked", "running", "suspended", "unavailable"),
    }),
  ),
  "ui/resize": req(
    "client",
    "ui.resize",
    obj({
      width: { type: "integer", minimum: 1 },
      height: { type: "integer", minimum: 1 },
    }),
    obj({ width: uint, height: uint, accepted: bool }),
  ),
  "ui/viewport": note(
    "host",
    "ui.resize",
    obj({
      width: uint,
      height: uint,
      devicePixelRatio: { type: "number", minimum: 0.01 },
      visible: bool,
    }),
  ),
  "ui/appearance": note(
    "host",
    "ui.appearance",
    obj(
      {
        theme: en("light", "dark", "system"),
        reducedMotion: bool,
        contrast: en("normal", "more", "less"),
        accent: str,
      },
      ["theme", "reducedMotion", "contrast"],
    ),
  ),
  "files/import": req(
    "client",
    "files.import",
    obj({ accept: arr(str, 32), multiple: bool }),
    obj({ files: arr(file, 32) }),
  ),
  "files/export": req(
    "client",
    "files.export",
    obj({ name: str, mimeType: str, size: uint }),
    obj({ transferId: str }),
  ),
  "files/chunk": req(
    "either",
    "files",
    obj({
      transferId: str,
      index: uint,
      byteLength: { type: "integer", minimum: 1, maximum: 262144 },
      buffer: {},
    }),
    obj({ nextIndex: uint }),
  ),
  "files/finish": req(
    "either",
    "files",
    obj({
      transferId: str,
      totalBytes: uint,
      sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
    }),
    obj({ accepted: { const: true } }),
  ),
};
export function capabilityFor(
  type: string,
  sender: "host" | "client",
): string | undefined {
  const cap = OPERATIONS[type]?.capability;
  return cap === "midi"
    ? `midi.${sender === "host" ? "input" : "output"}`
    : cap === "events"
      ? `events.${sender === "host" ? "input" : "output"}`
      : cap;
}
