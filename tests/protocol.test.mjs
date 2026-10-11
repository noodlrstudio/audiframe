import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseEnvelope,
  parseBootstrap,
  jsonBytes,
  validateMidi,
  noteOn,
  clockSample,
  positionAt,
  validateSnapshot,
  createParameterStore,
  MidiRouter,
  originOf,
} from "../packages/protocol/dist/index.js";
import { runFixtures } from "../packages/conformance/dist/index.js";
const envelope = {
  channel: "audiframe",
  version: { major: 1, minor: 0 },
  sessionId: "session",
  seq: 1,
  kind: "request",
  type: "state/get",
  requestId: "req",
  payload: {},
};
test("golden corpus accepts only valid fixtures", () => {
  assert.ok(
    runFixtures(JSON.parse(readFileSync("spec/fixtures/core.json"))).every(
      (r) => r.status === "PASS",
    ),
  );
});
test("rejects nonfinite, cycles, exotic objects, oversized utf8, depth", () => {
  for (const value of [NaN, Infinity, undefined, new Date(), { x: undefined }])
    assert.throws(() => jsonBytes(value));
  const cycle = {};
  cycle.x = cycle;
  assert.throws(() => jsonBytes(cycle));
  assert.throws(() => jsonBytes("é".repeat(10), 15));
  assert.throws(() => jsonBytes({ a: { b: {} } }, 100, 1));
});
test("envelope discriminator and response exclusivity", () => {
  assert.throws(() => parseEnvelope({ ...envelope, kind: "notification" }));
  assert.throws(() =>
    parseEnvelope({
      ...envelope,
      kind: "response",
      error: { code: "X", message: "X", retryable: false },
    }),
  );
  assert.throws(() => parseEnvelope({ ...envelope, seq: 0 }));
  assert.throws(() =>
    parseEnvelope({ ...envelope, version: { major: 2, minor: 0 } }),
  );
});
test("MIDI complete packets, zero velocity and unsupported statuses", () => {
  assert.deepEqual(noteOn(60, 0, 10), [0x89, 60, 0]);
  for (const data of [
    [0x90, 60],
    [0x90, 128, 1],
    [0xf0, 1, 0xf7],
    [0xf9],
    [0x70, 1, 1],
    [0xc0, 1, 1],
    [-1],
    [256],
  ])
    assert.throws(() => validateMidi(data));
  validateMidi([0xc0, 1]);
  validateMidi([0xf8]);
});
test("clock offset and quarter note interpolation", () => {
  assert.deepEqual(clockSample(10, 111, 112, 13), {
    offsetMs: 100,
    rttMs: 2,
    uncertaintyMs: 1,
  });
  assert.equal(
    positionAt(
      {
        state: "playing",
        effectiveAtMs: 0,
        positionSeconds: 0,
        positionBeats: 0,
        bpm: 120,
        loop: null,
      },
      1000,
    ).beats,
    2,
  );
});
test("restore rejects mismatched identity and future schemas", () => {
  const manifest = {
    id: "test.app",
    stateSchemas: [{ schemaId: "test.state", readableVersions: [1] }],
  };
  assert.throws(() =>
    validateSnapshot(
      { appId: "other.app", schemaId: "test.state", schemaVersion: 1 },
      manifest,
    ),
  );
  assert.throws(() =>
    validateSnapshot(
      { appId: "test.app", schemaId: "test.state", schemaVersion: 2 },
      manifest,
    ),
  );
});
test("parameter batches validate before any writes", async () => {
  let writes = 0;
  const p = createParameterStore(
    [
      {
        id: "gain",
        label: "Gain",
        type: "float",
        minValue: 0,
        maxValue: 1,
        defaultValue: 0.5,
        automatable: true,
        readOnly: false,
      },
    ],
    () => writes++,
  );
  await assert.rejects(
    p.handlers["parameters/set"]({
      changes: [
        { id: "gain", value: 0.2 },
        { id: "missing", value: 1 },
      ],
    }),
  );
  assert.equal(writes, 0);
  await p.handlers["parameters/set"]({ changes: [{ id: "gain", value: 1 }] });
  assert.equal(writes, 1);
});
test("routing deduplicates, drops stale notes, prioritizes note-off and panics", () => {
  const r = new MidiRouter();
  const e = { id: "1", portId: "out", data: [0x90, 60, 100] };
  assert.equal(r.route([e, e], "owned", 10).length, 1);
  assert.equal(r.panic().length, 1);
  assert.equal(r.route([{ ...e, id: "2", atMs: 0 }], "owned", 1000).length, 0);
  assert.equal(
    r.route([{ ...e, id: "3", data: [0x80, 60, 0], atMs: 0 }], "owned", 1000)
      .length,
    1,
  );
});
test("exact HTTPS origins and development localhost", () => {
  assert.equal(originOf("https://example.com/path"), "https://example.com");
  assert.throws(() => originOf("http://example.com", true));
  assert.throws(() => originOf("https://u:p@example.com"));
  assert.equal(
    originOf("http://localhost:4100", true),
    "http://localhost:4100",
  );
});
test("prototype operation names are not executable operations", () => {
  parseEnvelope({ ...envelope, type: "toString" });
});
test("application errors retain codes across independently bundled SDKs", async () => {
  const { AudiframeError, asAudiframeError } =
    await import("../packages/protocol/dist/index.js");
  const e = new Error("Invalid value");
  e.name = "AudiframeError";
  e.code = "INVALID_VALUE";
  assert.equal(asAudiframeError(e).code, "INVALID_VALUE");
});
test("scheduled note-offs follow future notes; immediate releases cancel queued notes", async () => {
  const { MidiScheduler } = await import("../packages/protocol/dist/index.js");
  const delivered = [];
  const scheduler = new MidiScheduler(
    (events) => delivered.push(...events),
    () => 0,
  );
  scheduler.enqueue([
    { id: "on", portId: "in", data: [0x90, 60, 100], atMs: 20 },
    { id: "off", portId: "in", data: [0x80, 60, 0], atMs: 40 },
  ]);
  assert.equal(delivered.length, 0);
  await new Promise((r) => setTimeout(r, 55));
  assert.deepEqual(
    delivered.map((e) => e.data[0]),
    [0x90, 0x80],
  );
  delivered.length = 0;
  scheduler.enqueue([
    { id: "queued", portId: "in", data: [0x90, 61, 100], atMs: 20 },
  ]);
  scheduler.enqueue([{ id: "cancel", portId: "in", data: [0x80, 61, 0] }]);
  await new Promise((r) => setTimeout(r, 35));
  assert.deepEqual(
    delivered.map((e) => e.data[0]),
    [0x80],
  );
  scheduler.flush();
});
