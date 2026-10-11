import { id, noteOn, noteOff } from "../../packages/protocol/dist/index.js";
let timer;
let step = 0;
const button = document.querySelector("#sequence");
button.onclick = () => {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
    button.textContent = "Sequence";
    return;
  }
  step = 0;
  button.textContent = "Stop";
  timer = setInterval(() => {
    const { client, document: state } = window.example;
    if (state.steps[step % 8]) {
      try {
        client.sendMidi([
          { id: id(), portId: "out", data: noteOn(36, 100, 10) },
        ]);
        setTimeout(() => {
          try {
            client.sendMidi([
              { id: id(), portId: "out", data: noteOff(36, 10) },
            ]);
          } catch {}
        }, 80);
      } catch {}
    }
    step++;
  }, 125);
};
window.addEventListener("pagehide", () => clearInterval(timer));
