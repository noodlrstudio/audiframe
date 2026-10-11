import { createHostSession } from "../../packages/host/dist/index.js";
import { id, noteOn, noteOff } from "../../packages/protocol/dist/index.js";
const iframe = document.querySelector("iframe");
const output = document.querySelector("output");
let saved;
const host = createHostSession({
  iframe,
  url: iframe.src,
  development: true,
  capabilities: [
    "lifecycle",
    "state.snapshot",
    "midi.input",
    "midi.output",
    "ui.resize",
  ],
  onSnapshot(snapshot) {
    saved = snapshot;
  },
  onState(state) {
    output.textContent =
      {
        unavailable: "Instrument unavailable. Open it externally or reload.",
        rejected: "This instrument cannot connect.",
        "restore-blocked": "Recall failed. Your saved pattern is preserved.",
      }[state] ?? "";
  },
});
const run = async (action) => {
  try {
    await action();
  } catch (e) {
    output.textContent = e.message;
  }
};
document.querySelector("#save").onclick = () =>
  run(async () => {
    saved = await host.getState();
    localStorage.setItem("audiframe.pulse.snapshot", JSON.stringify(saved));
    output.textContent = "Saved";
  });
document.querySelector("#restore").onclick = () =>
  run(async () => {
    saved ??= JSON.parse(
      localStorage.getItem("audiframe.pulse.snapshot") ?? "null",
    );
    if (saved) {
      await host.restore(saved);
      output.textContent = "Recalled";
    }
  });
document.querySelector("#fresh").onclick = () => run(() => host.startFresh());
document.querySelector("#focus").onclick = () => iframe.contentWindow.focus();
document.querySelector("#note").onclick = () =>
  run(async () => {
    host.sendMidi([{ id: id(), portId: "in-midi", data: noteOn(36, 100, 10) }]);
    setTimeout(
      () =>
        host.sendMidi([{ id: id(), portId: "in-midi", data: noteOff(36, 10) }]),
      150,
    );
  });
iframe.addEventListener("load", () =>
  run(async () => {
    await host.connect();
    const snapshot = JSON.parse(
      localStorage.getItem("audiframe.pulse.snapshot") ?? "null",
    );
    if (snapshot) await host.restore(snapshot);
    else await host.startFresh();
  }),
);
window.example = {
  host,
  get saved() {
    return saved;
  },
};
