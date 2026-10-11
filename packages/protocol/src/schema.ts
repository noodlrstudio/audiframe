import { AudiframeError } from "./types";
export type Schema = {
  type?: string;
  const?: unknown;
  enum?: unknown[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  oneOf?: Schema[];
  anyOf?: Schema[];
  not?: Schema;
  additionalProperties?: boolean;
  pattern?: string;
};
export const str: Schema = { type: "string", minLength: 1, maxLength: 2048 };
export const num: Schema = { type: "number" };
export const uint: Schema = { type: "integer", minimum: 0 };
export const bool: Schema = { type: "boolean" };
export const arr = (items: Schema, maxItems = 256): Schema => ({
  type: "array",
  items,
  maxItems,
});
export const obj = (
  properties: Record<string, Schema>,
  required = Object.keys(properties),
): Schema => ({ type: "object", properties, required });
export const en = (...values: string[]): Schema => ({
  type: "string",
  enum: values,
});
export const versionSchema = obj({
  major: { type: "integer", minimum: 1 },
  minor: uint,
});
export const grantSchema = obj(
  {
    id: str,
    version: { const: 1 },
    options: { type: "object" },
    required: bool,
  },
  ["id", "version"],
);
export const snapshotSchema = obj(
  {
    appId: str,
    schemaId: str,
    schemaVersion: { type: "integer", minimum: 1 },
    data: {},
    assets: arr(
      obj({
        id: str,
        sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        size: uint,
        mimeType: str,
      }),
      128,
    ),
  },
  ["appId", "schemaId", "schemaVersion", "data"],
);
export const manifestSchema = obj(
  {
    id: {
      type: "string",
      pattern: "^[a-zA-Z0-9_-]+(\\.[a-zA-Z0-9_-]+)+$",
      maxLength: 256,
    },
    name: { type: "string", minLength: 1, maxLength: 80 },
    appVersion: {
      type: "string",
      pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+(?:[-+][a-zA-Z0-9.-]+)?$",
    },
    protocolVersions: arr(versionSchema, 16),
    capabilities: arr(grantSchema, 32),
    ports: arr(
      obj({
        id: str,
        label: str,
        direction: en("in", "out"),
        type: en("midi1", "event"),
      }),
      32,
    ),
    stateSchemas: arr(
      obj({
        schemaId: str,
        writableVersion: uint,
        readableVersions: arr(uint, 32),
      }),
      32,
    ),
    ui: obj(
      {
        minWidth: uint,
        minHeight: uint,
        preferredWidth: uint,
        preferredHeight: uint,
        maxWidth: uint,
        maxHeight: uint,
        resizable: bool,
      },
      [
        "minWidth",
        "minHeight",
        "preferredWidth",
        "preferredHeight",
        "resizable",
      ],
    ),
    links: { type: "object" },
    extensions: { type: "object" },
  },
  ["id", "name", "appVersion", "protocolVersions", "capabilities"],
);
export function matches(s: Schema, v: unknown): boolean {
  if (s.const !== undefined && v !== s.const) return false;
  if (s.enum && !s.enum.includes(v)) return false;
  if (s.not && matches(s.not, v)) return false;
  if (s.anyOf && !s.anyOf.some((x) => matches(x, v))) return false;
  if (s.oneOf && s.oneOf.filter((x) => matches(x, v)).length !== 1)
    return false;
  if (s.type === "object") {
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    const r = v as Record<string, unknown>;
    if (s.required?.some((k) => !Object.hasOwn(r, k))) return false;
    for (const [k, x] of Object.entries(r)) {
      if (
        s.properties &&
        Object.hasOwn(s.properties, k) &&
        !matches(s.properties[k], x)
      )
        return false;
      if (
        s.additionalProperties === false &&
        (!s.properties || !Object.hasOwn(s.properties, k))
      )
        return false;
    }
  }
  if (s.type === "array") {
    if (
      !Array.isArray(v) ||
      v.length > (s.maxItems ?? Infinity) ||
      v.length < (s.minItems ?? 0)
    )
      return false;
    if (s.items && v.some((x) => !matches(s.items!, x))) return false;
  }
  if (s.type === "string") {
    if (
      typeof v !== "string" ||
      v.length < (s.minLength ?? 0) ||
      v.length > (s.maxLength ?? Infinity) ||
      (s.pattern && !new RegExp(s.pattern).test(v))
    )
      return false;
  }
  if (s.type === "boolean" && typeof v !== "boolean") return false;
  if (s.type === "null" && v !== null) return false;
  if (s.type === "number" || s.type === "integer") {
    if (
      typeof v !== "number" ||
      !Number.isFinite(v) ||
      (s.type === "integer" && !Number.isInteger(v)) ||
      v < (s.minimum ?? -Infinity) ||
      v > (s.maximum ?? Infinity)
    )
      return false;
  }
  return true;
}
export function assertSchema(s: Schema, v: unknown): void {
  if (!matches(s, v)) throw new AudiframeError("INVALID_MESSAGE");
}
export function jsonBytes(v: unknown, maxBytes = 65536, maxDepth = 32): number {
  const seen = new Set<object>();
  function visit(x: unknown, depth: number): void {
    if (depth > maxDepth)
      throw new AudiframeError("INVALID_MESSAGE", "JSON depth exceeded");
    if (x === null || typeof x === "string" || typeof x === "boolean") return;
    if (typeof x === "number" && Number.isFinite(x)) return;
    if (typeof x !== "object" || !x || seen.has(x))
      throw new AudiframeError("INVALID_MESSAGE", "Plain finite JSON required");
    if (
      !Array.isArray(x) &&
      Object.getPrototypeOf(x) !== Object.prototype &&
      Object.getPrototypeOf(x) !== null
    )
      throw new AudiframeError("INVALID_MESSAGE");
    seen.add(x);
    for (const value of Object.values(x)) visit(value, depth + 1);
    seen.delete(x);
  }
  visit(v, 0);
  const size = new TextEncoder().encode(JSON.stringify(v)).length;
  if (size > maxBytes)
    throw new AudiframeError("QUOTA_EXCEEDED", "JSON size exceeded");
  return size;
}
