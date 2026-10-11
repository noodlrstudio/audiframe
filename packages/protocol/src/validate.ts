import {
  AudiframeError,
  LIMITS,
  VERSION,
  type Envelope,
  type Bootstrap,
  type Manifest,
  type Limits,
  type Snapshot,
} from "./types";
import {
  assertSchema,
  jsonBytes,
  obj,
  str,
  uint,
  en,
  versionSchema,
  manifestSchema,
  grantSchema,
  arr,
  num,
  type Schema,
} from "./schema";
import { OPERATIONS } from "./operations";
export const limitsSchema = obj(
  Object.fromEntries(
    Object.entries(LIMITS).map(([k, v]) => [
      k,
      {
        type: "integer",
        minimum: 1,
        maximum: k === "stateBytes" ? 16777216 : v,
      } as Schema,
    ]),
  ),
);
export const bootstrapSchemas: Record<string, Schema> = {
  "connect/offer": obj({
    versions: arr(versionSchema, 16),
    host: obj({ id: str, name: str, version: str }),
    requestedCapabilities: arr(str, 32),
  }),
  "connect/accept": obj({
    selectedVersion: versionSchema,
    app: manifestSchema,
  }),
  "connect/reject": obj(
    { code: en("UNSUPPORTED_VERSION", "CAPABILITY_DENIED"), message: str },
    ["code"],
  ),
  "connect/bind": obj({
    sessionId: str,
    version: versionSchema,
    grants: arr(grantSchema, 32),
    limits: limitsSchema,
  }),
};
export const envelopeSchema = obj(
  {
    channel: { const: "audiframe" },
    version: versionSchema,
    sessionId: str,
    seq: { type: "integer", minimum: 1 },
    kind: en("request", "response", "notification"),
    type: str,
    requestId: str,
    payload: {},
    error: obj(
      { code: str, message: str, retryable: { type: "boolean" }, details: {} },
      ["code", "message", "retryable"],
    ),
  },
  ["channel", "version", "sessionId", "seq", "kind", "type"],
);
envelopeSchema.oneOf = [
  {
    ...obj({ kind: { const: "notification" }, payload: {} }, [
      "kind",
      "payload",
    ]),
    not: { anyOf: [obj({}, ["requestId"]), obj({}, ["error"])] },
  },
  {
    ...obj({ kind: { const: "request" }, payload: {}, requestId: str }),
    not: obj({}, ["error"]),
  },
  {
    ...obj({ kind: { const: "response" }, payload: {}, requestId: str }),
    not: obj({}, ["error"]),
  },
  {
    ...obj({ kind: { const: "response" }, error: {}, requestId: str }),
    not: obj({}, ["payload"]),
  },
];
export function parseBootstrap(v: unknown): Bootstrap {
  jsonBytes(v, 16384, 16);
  assertSchema(
    obj({
      channel: { const: "audiframe" },
      bootstrap: { const: 1 },
      type: en(...Object.keys(bootstrapSchemas)),
      nonce: { type: "string", minLength: 32, maxLength: 128 },
      payload: {},
    }),
    v,
  );
  const b = v as Bootstrap;
  assertSchema(bootstrapSchemas[b.type], b.payload);
  return b;
}
export function parseEnvelope(v: unknown, limits: Limits = LIMITS): Envelope {
  jsonBytes(v, limits.envelopeBytes, limits.depth);
  assertSchema(envelopeSchema, v);
  const e = v as Envelope;
  if (e.version.major !== VERSION.major || e.version.minor !== VERSION.minor)
    throw new AudiframeError("UNSUPPORTED_VERSION");
  if (
    e.kind === "notification" &&
    (e.requestId !== undefined || e.error !== undefined)
  )
    throw new AudiframeError("INVALID_MESSAGE");
  if (e.kind !== "notification" && !e.requestId)
    throw new AudiframeError("INVALID_MESSAGE");
  if (
    e.kind === "response" &&
    Object.hasOwn(e, "payload") === Object.hasOwn(e, "error")
  )
    throw new AudiframeError("INVALID_MESSAGE");
  if (
    e.kind !== "response" &&
    (e.error !== undefined || !Object.hasOwn(e, "payload"))
  )
    throw new AudiframeError("INVALID_MESSAGE");
  const op = Object.hasOwn(OPERATIONS, e.type) ? OPERATIONS[e.type] : undefined;
  if (e.kind !== "response" && op && (op.kind !== e.kind || !op.input))
    throw new AudiframeError("INVALID_MESSAGE");
  if (op && e.error === undefined)
    assertSchema(
      e.kind === "response" ? (op.output ?? {}) : op.input,
      e.payload,
    );
  if (
    e.type.startsWith("state/") &&
    e.payload &&
    typeof e.payload === "object" &&
    "snapshot" in e.payload
  ) {
    try {
      jsonBytes(e, limits.stateBytes, limits.depth);
    } catch {
      throw new AudiframeError("STATE_TOO_LARGE");
    }
  }
  return e;
}
export function validateManifest(m: Manifest): void {
  assertSchema(manifestSchema, m);
  jsonBytes(m, 14000, 16);
  for (const list of [
    m.capabilities,
    m.ports ?? [],
    m.stateSchemas?.map((s) => ({ id: s.schemaId })) ?? [],
  ])
    if (new Set(list.map((x) => x.id)).size !== list.length)
      throw new AudiframeError("INVALID_MESSAGE", "Duplicate manifest ID");
  if (!m.capabilities.some((c) => c.id === "lifecycle" && c.version === 1))
    throw new AudiframeError("CAPABILITY_DENIED", "Core requires lifecycle");
}
export function validateSnapshot(s: Snapshot, m: Manifest): void {
  if (s.appId !== m.id) throw new AudiframeError("APP_ID_MISMATCH");
  if (
    !m.stateSchemas?.some(
      (d) =>
        d.schemaId === s.schemaId &&
        d.readableVersions.includes(s.schemaVersion),
    )
  )
    throw new AudiframeError("STATE_SCHEMA_UNSUPPORTED");
  if (s.assets?.length)
    throw new AudiframeError("ASSET_MISSING", "Asset profile not enabled");
}
export function commonVersion(
  versions: { major: number; minor: number }[],
): typeof VERSION | undefined {
  return versions.some((v) => v.major === 1 && v.minor >= 0)
    ? { ...VERSION }
    : undefined;
}
