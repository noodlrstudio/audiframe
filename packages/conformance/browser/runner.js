import { createHostSession } from "../../host/dist/index.js";
import { runFixtures } from "../dist/index.js";
import { id, noteOn } from "../../protocol/dist/index.js";
const results = [];
const assert = (v, m) => {
  if (!v) throw new Error(m);
};
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, status: "PASS" });
  } catch (e) {
    results.push({ name, status: "FAIL", message: e.message });
  }
}
async function frame(capabilities) {
  const iframe = document.createElement("iframe");
  iframe.title = "Conformance instrument";
  iframe.src = "http://127.0.0.1:4101/examples/minimal-app/";
  document.querySelector("#frames").append(iframe);
  const host = createHostSession({
    iframe,
    url: iframe.src,
    development: true,
    capabilities,
  });
  await new Promise((r) => iframe.addEventListener("load", r, { once: true }));
  await host.connect();
  return {
    host,
    iframe,
    close() {
      host.close();
      iframe.remove();
    },
  };
}
export async function run() {
  results.length = 0;
  const fixtures = await (
    await fetch("../../../spec/fixtures/core.json")
  ).json();
  results.push(...runFixtures(fixtures));
  let p;
  await check("two-origin handshake and fresh epoch", async () => {
    p = await frame([
      "lifecycle",
      "state.snapshot",
      "midi.input",
      "midi.output",
      "parameters",
      "ui.resize",
    ]);
    assert(p.host.state === "connected", "Not connected");
    await p.host.startFresh();
    assert(p.host.state === "active", "Not active");
  });
  if (p) {
    const { host } = p;
    let original;
    await check("state round trip preserves opaque document", async () => {
      original = await host.getState();
      await host.restore({
        ...original,
        data: { ...original.data, level: 0.7 },
      });
      const recalled = await host.getState();
      assert(recalled.data.level === 0.7, "Recall failed");
    });
    await check(
      "future schema rejected without overwriting saved state",
      async () => {
        try {
          await host.restore({ ...original, schemaVersion: 999 });
          throw new Error("Accepted future schema");
        } catch (e) {
          assert(e.code === "STATE_SCHEMA_UNSUPPORTED", "Wrong error");
        }
        assert((await host.getState()).data.level === 0.7, "Overwritten");
      },
    );
    await check(
      "failed atomic restore blocks publication and allows explicit recovery",
      async () => {
        try {
          await host.restore({ ...original, data: { steps: [], level: 0 } });
          throw new Error("Accepted bad state");
        } catch (e) {
          assert(e.code === "RESTORE_FAILED", "Wrong restore error");
        }
        assert(host.state === "restore-blocked", "Not blocked");
        await host.restore(original);
        assert(
          (await host.getState()).data.level === original.data.level,
          "Recovery failed",
        );
      },
    );
    await check("parameter write validates full batch", async () => {
      try {
        await host.request("parameters/set", {
          changes: [
            { id: "level", value: 0.5 },
            { id: "missing", value: 1 },
          ],
        });
        throw new Error("Accepted invalid parameter");
      } catch (e) {
        assert(e.code === "INVALID_VALUE", "Wrong parameter error");
      }
    });
    await check("parameter read reflects restored document", async () => {
      await host.restore({
        ...original,
        data: { ...original.data, level: 0.6 },
      });
      const response = await host.request("parameters/get", { ids: ["level"] });
      assert(response.values[0].value === 0.6, "Stale parameter after recall");
    });
    await check(
      "restore applies a disabled policy without activating",
      async () => {
        const suspended = {
          mode: "suspended",
          enabled: false,
          audible: false,
          midiOutputEnabled: false,
          visible: true,
        };
        await host.restore(original, { lifecycle: suspended });
        assert(host.state === "suspended", "Restore activated a disabled app");
        await host.startFresh({ lifecycle: suspended });
        assert(
          host.state === "suspended",
          "Fresh start activated a disabled app",
        );
        await host.setLifecycle({
          ...suspended,
          mode: "active",
          enabled: true,
          audible: true,
          midiOutputEnabled: true,
        });
        assert(host.state === "active", "Not reactivated");
      },
    );
    await check("grant revocation denies performance traffic", async () => {
      host.narrowGrants(host.grants.filter((g) => g.id !== "midi.input"));
      try {
        host.sendMidi([{ id: id(), portId: "in", data: noteOn(60, 100, 10) }]);
        throw new Error("Accepted revoked MIDI");
      } catch (e) {
        assert(e.code === "CAPABILITY_DENIED", "Wrong denial");
      }
    });
    await check(
      "navigation invalidates session and pending state",
      async () => {
        p.iframe.src += "?reload=1";
        await new Promise((r) =>
          p.iframe.addEventListener("load", r, { once: true }),
        );
        await host.connect();
        assert(host.state === "connected", "Not reconnected");
        try {
          await host.getState();
          throw new Error("Ungated after reload");
        } catch (e) {
          assert(e.code === "STALE_EPOCH", "Wrong gate");
        }
      },
    );
    p.close();
  }
  await check("state capability denied independently", async () => {
    const denied = await frame(["lifecycle"]);
    try {
      await denied.host.startFresh();
      try {
        await denied.host.getState();
        throw new Error("Accepted denied state");
      } catch (e) {
        assert(e.code === "CAPABILITY_DENIED", "Wrong denied error");
      }
    } finally {
      denied.close();
    }
  });
  const raw = async (mode) => {
    const iframe = document.createElement("iframe");
    iframe.title = "Independent adversarial wire fixture";
    iframe.src = "http://127.0.0.1:4101/examples/adversarial-app/?mode=" + mode;
    document.querySelector("#frames").append(iframe);
    const host = createHostSession({
      iframe,
      url: iframe.src,
      development: true,
      capabilities: ["lifecycle"],
    });
    await new Promise((r) =>
      iframe.addEventListener("load", r, { once: true }),
    );
    return {
      host,
      iframe,
      close() {
        host.close();
        iframe.remove();
      },
    };
  };
  for (const [mode, expected] of [
    ["reject", "UNSUPPORTED_VERSION"],
    ["nonce", "TIMEOUT"],
    ["timeout", "TIMEOUT"],
  ])
    await check("independent peer " + mode, async () => {
      const peer = await raw(mode);
      try {
        try {
          await peer.host.connect();
          throw new Error("Connected invalid peer");
        } catch (e) {
          assert(e.code === expected, "Wrong bootstrap outcome: " + e.code);
        }
      } finally {
        peer.close();
      }
    });
  await check("stale session cannot close independent peer", async () => {
    const peer = await raw("stale");
    try {
      await peer.host.connect();
      assert(
        peer.host.state === "connected",
        "Stale packet closed current session",
      );
    } finally {
      peer.close();
    }
  });
  await check("repeated ungranted traffic closes abusive peer", async () => {
    const peer = await raw("flood");
    try {
      await peer.host.connect();
      await new Promise((r) => setTimeout(r, 50));
      assert(peer.host.state === "unavailable", "Abuse was not terminated");
    } finally {
      peer.close();
    }
  });
  const report = {
    protocolVersion: "1.0",
    suiteVersion: "0.1.0-alpha.1",
    timestamp: new Date().toISOString(),
    browser: navigator.userAgent,
    scope:
      "Fixture validation and reference SDK runtime; audio and timing unverified",
    profiles: {
      core: results.every((r) => r.status === "PASS") ? "PASS" : "FAIL",
      files: "unsupported",
      events: "unsupported",
      transport: "unsupported",
    },
    results,
  };
  window.conformanceReport = report;
  document.querySelector("#report").textContent = JSON.stringify(
    report,
    null,
    2,
  );
  document.querySelector("output").textContent = results.every(
    (r) => r.status === "PASS",
  )
    ? "Checks passed"
    : "Checks failed";
  return report;
}
document.querySelector("#run").onclick = () => run();
