import { test } from "node:test";
import assert from "node:assert/strict";
import { Session, AudiframeError } from "../packages/protocol/dist/index.js";
function pair(
  grants = [
    { id: "lifecycle", version: 1 },
    { id: "state.snapshot", version: 1 },
  ],
) {
  const c = new MessageChannel();
  const host = new Session({
    port: c.port1,
    sessionId: "test",
    role: "host",
    grants,
  });
  const client = new Session({
    port: c.port2,
    sessionId: "test",
    role: "client",
    grants,
  });
  return {
    host,
    client,
    close() {
      host.close();
      client.close();
    },
  };
}
test("requests, errors and pending cleanup", async () => {
  const p = pair();
  try {
    const r = await p.host.request("session/ping", { sentAtMs: 0 });
    assert.equal(typeof r.receivedAtMs, "number");
    await assert.rejects(
      p.host.request("state/get", {}),
      (e) => e.code === "UNSUPPORTED_OPERATION",
    );
  } finally {
    p.close();
  }
});
test("denied capability fails locally", async () => {
  const p = pair([{ id: "lifecycle", version: 1 }]);
  try {
    await assert.rejects(
      p.host.request("state/get", {}),
      (e) => e.code === "CAPABILITY_DENIED",
    );
  } finally {
    p.close();
  }
});
test("timeout, abort and disconnect settle requests", async () => {
  const p = pair();
  p.client.handlers.set("state/get", () => new Promise(() => {}));
  try {
    await assert.rejects(
      p.host.request("state/get", {}, { timeoutMs: 10 }),
      (e) => e.code === "TIMEOUT",
    );
    const a = new AbortController();
    const req = p.host.request("state/get", {}, { signal: a.signal });
    a.abort();
    await assert.rejects(req, (e) => e.code === "CANCELLED");
    const req2 = p.host.request("state/get", {});
    p.host.close();
    await assert.rejects(req2, (e) => e.code === "DISCONNECTED");
  } finally {
    p.close();
  }
});
test("grants may narrow but never expand", async () => {
  const p = pair();
  try {
    p.host.narrow([{ id: "lifecycle", version: 1 }]);
    assert.throws(() =>
      p.host.narrow([
        { id: "lifecycle", version: 1 },
        { id: "state.snapshot", version: 1 },
      ]),
    );
    await new Promise((r) => setTimeout(r, 10));
    await assert.rejects(
      p.client.request("transport/request", { action: "play" }),
      (e) => e.code === "CAPABILITY_DENIED",
    );
  } finally {
    p.close();
  }
});
test("duplicate request ID replay and mutation serialization", async () => {
  const ch = new MessageChannel();
  const client = new Session({
    port: ch.port2,
    sessionId: "s",
    role: "client",
    grants: [{ id: "state.snapshot", version: 1 }],
  });
  let writes = 0;
  let active = 0;
  client.handlers.set("state/set", async (p) => {
    assert.equal(active++, 0);
    await new Promise((r) => setTimeout(r, 5));
    writes++;
    active--;
    return { epoch: p.epoch, revision: 0 };
  });
  let seq = 0;
  const replies = [];
  ch.port1.onmessage = (e) => replies.push(e.data);
  const send = (requestId, epoch) =>
    ch.port1.postMessage({
      channel: "audiframe",
      version: { major: 1, minor: 0 },
      sessionId: "s",
      seq: ++seq,
      kind: "request",
      type: "state/set",
      requestId,
      payload: {
        snapshot: {
          appId: "test.app",
          schemaId: "test.state",
          schemaVersion: 1,
          data: {},
        },
        epoch,
      },
    });
  try {
    send("1", "a");
    send("1", "a");
    send("2", "b");
    await new Promise((r) => setTimeout(r, 35));
    assert.equal(writes, 2);
    assert.equal(replies.length, 3);
    send("1", "different");
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(replies.at(-1).error.code, "INVALID_MESSAGE");
  } finally {
    client.close();
    ch.port1.close();
  }
});
test("wrong session and sequence never dispatch", async () => {
  const ch = new MessageChannel();
  let calls = 0;
  const client = new Session({
    port: ch.port2,
    sessionId: "s",
    role: "client",
    grants: [],
    onNotification: () => calls++,
  });
  try {
    ch.port1.postMessage({
      channel: "audiframe",
      version: { major: 1, minor: 0 },
      sessionId: "old",
      seq: 1,
      kind: "notification",
      type: "session/close",
      payload: { reason: "stale" },
    });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(client.closed, false);
    assert.equal(calls, 0);
    assert.equal(client.counters.invalid, 1);
  } finally {
    client.close();
    ch.port1.close();
  }
});
test("unknown optional notifications are ignored without closing the peer", async () => {
  const channel = new MessageChannel();
  const client = new Session({
    port: channel.port2,
    sessionId: "s",
    role: "client",
    grants: [],
  });
  try {
    for (let seq = 1; seq <= 10; seq++)
      channel.port1.postMessage({
        channel: "audiframe",
        version: { major: 1, minor: 0 },
        sessionId: "s",
        seq,
        kind: "notification",
        type: "x.example.optional",
        payload: {},
      });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(client.closed, false);
    assert.equal(client.counters.dropped, 10);
  } finally {
    client.close();
    channel.port1.close();
  }
});
