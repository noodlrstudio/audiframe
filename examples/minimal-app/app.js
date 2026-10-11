import { createClient } from "../../packages/client/dist/index.js";
import {
  createParameterStore,
  id,
  noteOn,
  noteOff,
  AudiframeError,
} from "../../packages/protocol/dist/index.js";
const appId = "org.audiframe.examples.steps";
const schemaId = appId + ".document";
let documentState = {
  steps: [true, false, true, false, true, false, true, false],
  level: 0.3,
};
let context;
let enabled = true;
let audible = true;
let oscillator;
let hostState = "idle";
const status = document.querySelector("output");
const steps = document.querySelector(".steps");
const level = document.querySelector("input");
const stop = () => {
  try {
    oscillator?.stop();
  } catch {}
  oscillator = undefined;
};
const play = async (note = 60) => {
  if (!enabled || !audible) return;
  context ??= new AudioContext();
  await context.resume();
  stop();
  oscillator = context.createOscillator();
  const gain = context.createGain();
  gain.gain.value = documentState.level * 0.15;
  oscillator.frequency.value = 440 * 2 ** ((note - 69) / 12);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.15);
};
const render = () => {
  steps.replaceChildren(
    ...documentState.steps.map((on, i) => {
      const b = document.createElement("button");
      b.textContent = String(i + 1);
      b.setAttribute("aria-label", `Step ${i + 1}`);
      b.setAttribute("aria-pressed", String(on));
      b.onclick = () => {
        documentState.steps[i] = !documentState.steps[i];
        render();
        client.markStateDirty();
      };
      return b;
    }),
  );
  level.value = String(documentState.level);
  parameters.synchronize([{ id: "level", value: documentState.level }]);
};
const parameters = createParameterStore(
  [
    {
      id: "level",
      label: "Level",
      type: "float",
      minValue: 0,
      maxValue: 1,
      defaultValue: 0.3,
      automatable: true,
      readOnly: false,
    },
  ],
  (changes) => {
    documentState.level = changes[0].value;
    render();
    client.markStateDirty();
  },
);
const manifest = {
  id: appId,
  name: "Eight steps",
  appVersion: "0.1.0",
  protocolVersions: [{ major: 1, minor: 0 }],
  capabilities: [
    "lifecycle",
    "state.snapshot",
    "midi.input",
    "midi.output",
    "parameters",
    "ui.resize",
    "ui.appearance",
  ].map((id) => ({ id, version: 1 })),
  ports: [
    { id: "in", label: "Notes in", direction: "in", type: "midi1" },
    { id: "out", label: "Notes out", direction: "out", type: "midi1" },
  ],
  stateSchemas: [{ schemaId, writableVersion: 1, readableVersions: [1] }],
};
const client = createClient({
  manifest,
  development: true,
  state: {
    get: () => ({
      appId,
      schemaId,
      schemaVersion: 1,
      data: structuredClone(documentState),
    }),
    set(snapshot) {
      const d = snapshot.data;
      if (
        !d ||
        !Array.isArray(d.steps) ||
        d.steps.length !== 8 ||
        d.steps.some((v) => typeof v !== "boolean") ||
        typeof d.level !== "number" ||
        d.level < 0 ||
        d.level > 1
      )
        throw new AudiframeError("RESTORE_FAILED");
      const candidate = structuredClone(d);
      stop();
      documentState = candidate;
      render();
    },
  },
  lifecycle(policy) {
    enabled = policy.enabled && policy.mode === "active";
    audible = policy.audible;
    if (!enabled || !audible) stop();
    return context?.state === "running" ? "running" : "locked";
  },
  midi(events) {
    for (const event of events) {
      if ((event.data[0] & 0xf0) === 0x90 && event.data[2] > 0)
        void play(event.data[1]);
      else stop();
    }
  },
  onPanic: stop,
  handlers: parameters.handlers,
  onState(state) {
    hostState = state;
    status.textContent =
      state === "restore-blocked" ? "Pattern could not be restored." : "";
  },
});
level.oninput = () => {
  documentState.level = Number(level.value);
  parameters.synchronize([{ id: "level", value: documentState.level }]);
  client.markStateDirty();
};
document.querySelector("#play").onclick = () => {
  void play();
  client.sendMidi([{ id: id(), portId: "out", data: noteOn(60, 100, 10) }]);
  setTimeout(
    () => client.sendMidi([{ id: id(), portId: "out", data: noteOff(60, 10) }]),
    150,
  );
};
render();
client.connect();
// Explicit developer test seam; nothing is displayed in the instrument UI.
window.example = {
  client,
  get document() {
    return structuredClone(documentState);
  },
  get connectionState() {
    return hostState;
  },
  setLevel(value) {
    documentState.level = value;
    render();
    client.markStateDirty();
  },
  dispose: () => client.dispose(),
};
