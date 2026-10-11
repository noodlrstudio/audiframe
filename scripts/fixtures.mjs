import { writeFileSync } from "node:fs";
import {
  OPERATIONS,
  bootstrapSchemas,
  VERSION,
} from "../packages/protocol/dist/index.js";
function sample(s) {
  if (s.const !== undefined) return s.const;
  if (s.enum) return s.enum[0];
  if (s.oneOf) return sample(s.oneOf[0]);
  if (s.type === "object")
    return Object.fromEntries(
      (s.required ?? []).map((k) => [k, sample(s.properties[k])]),
    );
  if (s.type === "array") return [];
  if (s.type === "boolean") return true;
  if (s.type === "integer" || s.type === "number") return s.minimum ?? 0;
  if (s.type === "null") return null;
  if (s.type === "string")
    return s.pattern?.includes("64")
      ? "a".repeat(64)
      : s.pattern?.includes("0-9") && s.pattern?.includes("?:")
        ? "1.0.0"
        : s.pattern
          ? "test.app"
          : "example";
  return {};
}
const fixtures = [];
for (const [type, schema] of Object.entries(bootstrapSchemas)) {
  const value = {
    channel: "audiframe",
    bootstrap: 1,
    type,
    nonce: "a".repeat(32),
    payload: sample(schema),
  };
  if (type === "connect/accept") value.payload.app.appVersion = "1.0.0";
  fixtures.push(
    { name: type, format: "bootstrap", valid: true, value },
    {
      name: type + " invalid nonce",
      format: "bootstrap",
      valid: false,
      value: { ...value, nonce: "short" },
    },
  );
}
let seq = 0;
for (const [type, op] of Object.entries(OPERATIONS)) {
  const value = {
    channel: "audiframe",
    version: VERSION,
    sessionId: "fixture",
    seq: ++seq,
    kind: op.kind,
    type,
    ...(op.kind === "request" ? { requestId: type } : {}),
    payload: sample(op.input),
  };
  fixtures.push(
    { name: type + " success", format: "envelope", valid: true, value },
    {
      name: type + " missing payload",
      format: "envelope",
      valid: false,
      value: { ...value, payload: undefined },
    },
  );
  if (op.kind === "request") {
    fixtures.push(
      {
        name: type + " response",
        format: "envelope",
        valid: true,
        value: { ...value, kind: "response", payload: sample(op.output) },
      },
      {
        name: type + " error",
        format: "envelope",
        valid: true,
        value: {
          ...value,
          kind: "response",
          payload: undefined,
          error: {
            code: "CAPABILITY_DENIED",
            message: "Denied",
            retryable: false,
          },
        },
      },
    );
  }
}
for (const [data, valid] of [
  [[0x99, 60, 100], true],
  [[0x89, 60, 0], true],
  [[0x99, 60], false],
  [[0xf0, 1, 0xf7], false],
  [[0x99, 128, 100], false],
])
  fixtures.push({
    name: "midi " + data.join(","),
    format: "midi",
    valid,
    value: data,
  });
writeFileSync(
  "spec/fixtures/core.json",
  "[\n" +
    fixtures.map((f) => "  " + JSON.stringify(f)).join(",\n") +
    "\n]" +
    "\n",
);
