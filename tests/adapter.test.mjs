import { test } from "node:test";
import assert from "node:assert/strict";
import {
  convertLegacySnapshot,
  legacyNote,
  legacyPacket,
  legacyRuntime,
  descriptor,
  v1Descriptor,
} from "../packages/adapter-noodlr/dist/index.js";
test("legacy state conversion is detached and explicitly marked as lossy", () => {
  const source = {
    pluginId: "test.app",
    schemaVersion: 1,
    state: { pattern: [1, 0] },
  };
  const s = convertLegacySnapshot(source, "test.app.document");
  s.data.pattern[0] = 0;
  assert.equal(source.state.pattern[0], 1);
  assert.equal(s.appId, "test.app");
  assert.match(descriptor.limitations[0], /no atomic restore acknowledgement/);
  assert.ok(!v1Descriptor.mappedCapabilities.includes("state.snapshot"));
});
test("legacy velocity zero and clock normalization", () => {
  assert.deepEqual(
    legacyNote({ type: "noteon", note: 36, velocity: 0, channel: 10 }),
    [0x89, 36, 0],
  );
  assert.equal(legacyPacket([0x99, 36, 100], "out", 123).timestamp, 123);
  assert.equal(
    legacyRuntime({
      mode: "suspended",
      enabled: true,
      audible: true,
      midiOutputEnabled: true,
    }).isEnabled,
    false,
  );
});
