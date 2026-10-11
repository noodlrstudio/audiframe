const status = document.querySelector("output");
document.querySelector("#import").onclick = async () => {
  try {
    await window.example.client.request("files/import", {
      accept: ["application/json"],
      multiple: false,
    });
  } catch (e) {
    status.textContent =
      e.code === "CAPABILITY_DENIED"
        ? "File access is unavailable. The instrument remains usable."
        : e.message;
  }
};
document.querySelector("#resize").onclick = async () => {
  try {
    await window.example.client.requestResize(800, 400);
  } catch (e) {
    status.textContent = e.message;
  }
};
