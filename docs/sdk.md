# SDK usage

Self-host the pinned ESM modules from package `dist/index.js`, or use a bundler
with the packages and their TypeScript declarations. No CDN is required.

```ts
import { createClient } from "@audiframe/client";
const client = createClient({
  manifest: {
    id: "org.example.instrument",
    name: "Instrument",
    appVersion: "1.0.0",
    protocolVersions: [{ major: 1, minor: 0 }],
    capabilities: [
      { id: "lifecycle", version: 1 },
      { id: "state.snapshot", version: 1 },
    ],
    stateSchemas: [
      {
        schemaId: "org.example.document",
        writableVersion: 1,
        readableVersions: [1],
      },
    ],
  },
  state: {
    get: () => ({
      appId: "org.example.instrument",
      schemaId: "org.example.document",
      schemaVersion: 1,
      data: serializeDocument(),
    }),
    set: async (snapshot, signal) => {
      const candidate = validateAndMigrate(snapshot.data);
      await prepareDependencies(candidate, signal);
      if (signal.aborted) throw new Error("Cancelled");
      stopPlayback();
      applyDocument(candidate); // atomic synchronous swap
    },
  },
  lifecycle: async (policy) => {
    applyPerformancePolicy(policy);
    return audioStatus();
  },
  onPanic: () => stopAndReleaseNotes(),
});
client.connect();
// Call after document edits. No output occurs before restore/fresh activation.
client.markStateDirty();
```

```ts
import { createHostSession } from "@audiframe/host";
const host = createHostSession({
  iframe,
  url: iframe.src,
  capabilities: ["lifecycle", "state.snapshot"],
  onSnapshot: (snapshot) =>
    persistForApprovedOrigin(snapshot, new URL(iframe.src).origin),
});
await host.connect();
if (savedSnapshot) await host.restore(savedSnapshot);
else await host.startFresh();
const snapshot = await host.getState({
  signal: abortController.signal,
  timeoutMs: 800,
});
// Persist only if the host's document edit generation still matches.
```

`restore()` waits for atomic state acknowledgement and then activates performance.
Pass `{ lifecycle }` to `restore()` or `startFresh()` when the embedding is
disabled or muted, so the first lifecycle the app sees already carries that
policy (for example `mode: "suspended"`, `audible: false`) instead of a brief
active, audible window before a corrective `setLifecycle()`.
Failure preserves saved state; retry or explicit `startFresh()` is needed.
`invalidateState()` blocks host traffic and invalidates pending capture after undo
or document replacement. `close()`/`dispose()` reject pending calls, close ports,
remove listeners/timers and invoke panic hooks.

Use `request(type,payload,{signal,timeoutMs})` for optional request operations.
Register handlers only for capabilities you implement. `notify()` sends optional
app notifications. `createParameterStore()` validates a full batch before its
apply callback; that callback must atomically apply values or throw without mutation.
`validateEvents()` requires granted ports and explicit namespaced event schemas
in grant options `eventSchemas`. Unknown event names cannot act as RPC.

`sendMidi()` takes complete short packets and explicitly granted virtual ports.
Use `noteOn(note,velocity,channel)`/`noteOff(note,channel)`, channels **1–16**;
velocity zero normalizes to note-off. System messages need explicit
`options.systemStatuses`; SysEx is rejected. No implicit MIDI thru exists.
`MidiScheduler` is bounded and maps host milliseconds to local clock; clock
uncertainty is available on `client.clock`. Hosts own graph routing/deduplication.

Transport callbacks receive a validated constant-tempo segment and clock estimate.
Use `positionAt()` and `toAudioTime()` to schedule against the app's audio clock.
A handler must implement seek/loop discontinuities and background degradation
before advertising follow support. Control messages are not sample accurate.

Revocation currently supports removing grants; options must remain identical.
To change port/range/quota options, create a new negotiated session. This
conservative draft restriction avoids incorrectly comparing arbitrary options.
Files/assets are unsupported and must not be granted. A denied feature must
leave standalone operation usable. Metadata and errors belong in developer
inspection, with one calm user-facing recovery message when needed.

Operation input/output interfaces are generated directly from the schema registry.
Use `requestOperation(host, 'parameters/get', {ids: ['gain']})` to infer a typed
response, or the generic `request()` when working with an adapter. Call
`parameterStore.synchronize()` after app-owned edits or recall so parameter reads
reflect the live document.
