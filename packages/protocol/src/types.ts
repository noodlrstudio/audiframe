export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export type Version = { major: number; minor: number };
export const VERSION: Version = { major: 1, minor: 0 };
export const CAPABILITIES = [
  "state.snapshot",
  "midi.input",
  "midi.output",
  "events.input",
  "events.output",
  "transport.follow",
  "transport.request",
  "parameters",
  "lifecycle",
  "ui.resize",
  "ui.appearance",
  "files.import",
  "files.export",
] as const;
export type CapabilityId = (typeof CAPABILITIES)[number];
export interface Grant {
  id: string;
  version: 1;
  options?: Record<string, Json>;
}
export interface Manifest {
  id: string;
  name: string;
  appVersion: string;
  protocolVersions: Version[];
  capabilities: (Grant & { required?: boolean })[];
  ports?: {
    id: string;
    label: string;
    direction: "in" | "out";
    type: "midi1" | "event";
  }[];
  stateSchemas?: {
    schemaId: string;
    writableVersion: number;
    readableVersions: number[];
  }[];
  ui?: {
    minWidth: number;
    minHeight: number;
    preferredWidth: number;
    preferredHeight: number;
    maxWidth?: number;
    maxHeight?: number;
    resizable: boolean;
  };
  links?: Record<string, string>;
  extensions?: Record<string, Json>;
}
export interface Snapshot {
  appId: string;
  schemaId: string;
  schemaVersion: number;
  data: Json;
  assets?: { id: string; sha256: string; size: number; mimeType: string }[];
}
export interface Limits {
  envelopeBytes: number;
  stateBytes: number;
  depth: number;
  pending: number;
  batch: number;
  eventsPerSecond: number;
  eventBurst: number;
}
export const LIMITS: Limits = {
  envelopeBytes: 65536,
  stateBytes: 32768,
  depth: 32,
  pending: 128,
  batch: 256,
  eventsPerSecond: 1000,
  eventBurst: 2000,
};
export interface WireError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Json;
}
export interface Envelope {
  channel: "audiframe";
  version: Version;
  sessionId: string;
  seq: number;
  kind: "request" | "response" | "notification";
  type: string;
  requestId?: string;
  payload?: Json;
  error?: WireError;
}
export interface Bootstrap {
  channel: "audiframe";
  bootstrap: 1;
  type: "connect/offer" | "connect/accept" | "connect/reject" | "connect/bind";
  nonce: string;
  payload: Json;
}
export interface MidiEvent {
  id: string;
  portId: string;
  data: number[];
  atMs?: number;
  routeId?: string;
  hops?: number;
}
export interface Timeline {
  timelineId: string;
  discontinuity: number;
  state: "stopped" | "playing" | "paused";
  capturedAtMs: number;
  effectiveAtMs: number;
  positionSeconds: number;
  positionBeats: number;
  bpm: number;
  timeSignature: { numerator: number; denominator: number };
  loop: null | { startBeats: number; endBeats: number };
}
export interface Lifecycle {
  mode: "active" | "suspended" | "dispose";
  enabled: boolean;
  audible: boolean;
  midiOutputEnabled: boolean;
  visible: boolean;
  stateEpoch?: string;
}
export interface Parameter {
  id: string;
  label: string;
  type: "float" | "int" | "bool" | "enum";
  minValue: number;
  maxValue: number;
  defaultValue: number;
  unit?: string;
  step?: number;
  choices?: { value: number; label: string }[];
  automatable: boolean;
  readOnly: boolean;
}
export type ConnectionState =
  | "idle"
  | "offering"
  | "binding"
  | "connected"
  | "restoring"
  | "active"
  | "unavailable"
  | "rejected"
  | "restore-blocked"
  | "suspended"
  | "closing";
export const ERROR_CODES = [
  "INVALID_MESSAGE",
  "UNSUPPORTED_VERSION",
  "UNSUPPORTED_OPERATION",
  "CAPABILITY_DENIED",
  "INVALID_PORT",
  "INVALID_VALUE",
  "STATE_TOO_LARGE",
  "STATE_SCHEMA_UNSUPPORTED",
  "APP_ID_MISMATCH",
  "RESTORE_FAILED",
  "STALE_EPOCH",
  "ASSET_MISSING",
  "QUOTA_EXCEEDED",
  "RATE_LIMITED",
  "USER_GESTURE_REQUIRED",
  "CANCELLED",
  "TIMEOUT",
  "DISCONNECTED",
  "INTERNAL_ERROR",
] as const;
export class AudiframeError extends Error {
  constructor(
    public code: string,
    message = code,
    public retryable = false,
  ) {
    super(message);
    this.name = "AudiframeError";
  }
  wire(): WireError {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
  }
}
export function id(): string {
  return crypto.randomUUID();
}
export function originOf(url: string, development = false): string {
  const u = new URL(url);
  if (
    u.protocol !== "https:" &&
    !(
      development &&
      u.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
    )
  )
    throw new AudiframeError("INVALID_VALUE", "HTTPS origin required");
  if (u.username || u.password || u.origin === "null")
    throw new AudiframeError("INVALID_VALUE");
  return u.origin;
}

export function asAudiframeError(
  error: unknown,
  fallback = "INTERNAL_ERROR",
): AudiframeError {
  if (error instanceof AudiframeError) return error;
  if (
    error instanceof Error &&
    error.name === "AudiframeError" &&
    "code" in error &&
    ERROR_CODES.includes(error.code as (typeof ERROR_CODES)[number])
  )
    return new AudiframeError(
      String(error.code),
      error.message.slice(0, 256),
      "retryable" in error && error.retryable === true,
    );
  return new AudiframeError(fallback, "Operation failed");
}

export function nonceId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}
