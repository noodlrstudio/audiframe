import {
  AudiframeError,
  asAudiframeError,
  Session,
  VERSION,
  parseBootstrap,
  validateManifest,
  validateSnapshot,
  originOf,
  commonVersion,
  validatePorts,
  MidiScheduler,
  validateEvents,
  validateTimeline,
  syncClock,
  id,
  type Manifest,
  type Snapshot,
  type Grant,
  type Json,
  type Limits,
  type Lifecycle,
  type MidiEvent,
  type Timeline,
  type ConnectionState,
  type RequestOptions,
  type ClockSample,
  type MusicalEvent,
} from "@audiframe/protocol";
export interface ClientOptions {
  manifest: Manifest;
  development?: boolean;
  acceptHost?: (origin: string, host: Json) => boolean;
  state?: {
    get(): Snapshot;
    set(snapshot: Snapshot, signal: AbortSignal): void | Promise<void>;
  };
  midi?: (events: MidiEvent[]) => void;
  transport?: (timeline: Timeline, clock: ClockSample | undefined) => void;
  lifecycle: (
    policy: Lifecycle,
  ) =>
    | "locked"
    | "running"
    | "suspended"
    | "unavailable"
    | Promise<"locked" | "running" | "suspended" | "unavailable">;
  onPanic?: () => void;
  onState?: (state: ConnectionState) => void;
  onError?: (code: string) => void;
  handlers?: Record<
    string,
    (payload: Json, signal: AbortSignal) => Json | Promise<Json>
  >;
}
export function createClient(options: ClientOptions) {
  validateManifest(options.manifest);
  if (
    !options.manifest.protocolVersions.some(
      (v) => v.major === 1 && v.minor === 0,
    )
  )
    throw new AudiframeError("UNSUPPORTED_VERSION");
  let session: Session | undefined;
  let nonce = "";
  let origin = "";
  let acceptance: Json;
  let epoch = "";
  let revision = 0;
  let state: ConnectionState = "idle";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let clockTimer: ReturnType<typeof setInterval> | undefined;
  let clock: ClockSample | undefined;
  let policy: Lifecycle | undefined;
  let started = false;
  const scheduler = new MidiScheduler((events) => options.midi?.(events));
  let discontinuity = -1;
  const panic = () => {
    scheduler.flush();
    options.onPanic?.();
  };
  const change = (s: ConnectionState) => {
    state = s;
    options.onState?.(s);
  };
  const reset = () => {
    clearTimeout(timer);
    clearInterval(clockTimer);
    epoch = "";
    policy = undefined;
    session?.close();
    session = undefined;
    panic();
  };
  const publish = () => {
    if (state !== "active" || !epoch || !options.state || !session) return;
    try {
      const snapshot = options.state.get();
      validateSnapshot(snapshot, options.manifest);
      session.notify("state/changed", {
        snapshot: snapshot as unknown as Json,
        revision: ++revision,
        epoch,
      });
    } catch (e) {
      options.onError?.(asAudiframeError(e).code);
    }
  };
  const synchronize = async () => {
    try {
      const current = session;
      const sample = await syncClock((t) =>
        current!.request("session/ping", { sentAtMs: t }),
      );
      if (session === current) clock = sample;
    } catch {}
  };
  const ready = (
    port: MessagePort,
    sessionId: string,
    grants: Grant[],
    limits: Limits,
  ) => {
    session = new Session({
      port,
      sessionId,
      role: "client",
      grants,
      limits,
      onClose: () => {
        clearTimeout(timer);
        clearInterval(clockTimer);
        epoch = "";
        change("unavailable");
        panic();
      },
      onError: options.onError,
      onNotification: (type, payload) => {
        if (type === "session/grants") {
          panic();
          clearTimeout(timer);
        }
        if (type === "midi/batch") {
          if (state !== "active" || !policy?.enabled) return;
          const events = (payload as unknown as { events: MidiEvent[] }).events;
          validatePorts(events, options.manifest, session!.grants, "in");
          scheduler.enqueue(
            clock ? events : events.map((e) => ({ ...e, atMs: undefined })),
            clock ? clock.offsetMs : 0,
          );
        }
        if (
          type === "transport/update" &&
          state === "active" &&
          policy?.enabled
        ) {
          const t = payload as unknown as Timeline;
          validateTimeline(t);
          if (t.state !== "playing" || t.discontinuity !== discontinuity)
            panic();
          discontinuity = t.discontinuity;
          options.transport?.(t, clock);
        }
        if (type === "events/batch") {
          if (state !== "active" || !policy?.enabled) return;
          validateEvents(
            (payload as unknown as { events: MusicalEvent[] }).events,
            options.manifest,
            session!.grants,
            "in",
          );
        }
        const handler = options.handlers?.[type];
        if (handler)
          void Promise.resolve(
            handler(payload, new AbortController().signal),
          ).catch(() => options.onError?.("INTERNAL_ERROR"));
      },
    });
    for (const [type, handler] of Object.entries(options.handlers ?? {}))
      session.handlers.set(type, handler);
    session.handlers.set("state/get", () => {
      if (!epoch || state === "restore-blocked" || !options.state)
        throw new AudiframeError("STALE_EPOCH");
      const snapshot = options.state.get();
      validateSnapshot(snapshot, options.manifest);
      return { snapshot: snapshot as unknown as Json, revision };
    });
    session.handlers.set("state/set", async (payload, signal) => {
      const p = payload as unknown as { snapshot: Snapshot; epoch: string };
      clearTimeout(timer);
      epoch = "";
      change("restoring");
      panic();
      try {
        if (!options.state) throw new AudiframeError("UNSUPPORTED_OPERATION");
        validateSnapshot(p.snapshot, options.manifest);
        await options.state.set(p.snapshot, signal);
        epoch = p.epoch;
        revision = 0;
        change("connected");
        return { epoch, revision };
      } catch (e) {
        change("restore-blocked");
        throw asAudiframeError(e, "RESTORE_FAILED");
      }
    });
    session.handlers.set("lifecycle/set", async (payload) => {
      const p = payload as unknown as Lifecycle;
      if (p.mode === "active" && !epoch && !p.stateEpoch)
        throw new AudiframeError("STALE_EPOCH");
      if (p.mode !== "active" || !p.midiOutputEnabled) panic();
      if (p.mode === "active" && state === "suspended") void synchronize();
      const audioStatus = await options.lifecycle(p);
      if (p.stateEpoch) {
        epoch = p.stateEpoch;
        revision = 0;
      }
      policy = p;
      change(
        p.mode === "active"
          ? "active"
          : p.mode === "suspended"
            ? "suspended"
            : "closing",
      );
      if (p.mode === "dispose") setTimeout(reset, 0);
      return { applied: true, audioStatus };
    });
    change("connected");
    session.notify("session/ready", {
      acceptedGrants: grants.map((g) => g.id),
    });
    void synchronize();
    clockTimer = setInterval(() => void synchronize(), 30000);
  };
  const listen = (event: MessageEvent) => {
    if (event.source !== window.parent || window.parent === window) return;
    try {
      if (originOf(event.origin, options.development) !== event.origin) return;
    } catch {
      return;
    }
    let b;
    try {
      b = parseBootstrap(event.data);
    } catch {
      return;
    }
    if (b.type === "connect/offer") {
      if (session && nonce === b.nonce) return;
      const p = b.payload as unknown as {
        versions: { major: number; minor: number }[];
        host: Json;
      };
      if (options.acceptHost && !options.acceptHost(event.origin, p.host))
        return;
      const version = commonVersion(p.versions);
      if (!version) {
        window.parent.postMessage(
          {
            channel: "audiframe",
            bootstrap: 1,
            type: "connect/reject",
            nonce: b.nonce,
            payload: { code: "UNSUPPORTED_VERSION" },
          },
          event.origin,
        );
        return;
      }
      if (nonce !== b.nonce) {
        reset();
        nonce = b.nonce;
        origin = event.origin;
        acceptance = {
          selectedVersion: version,
          app: options.manifest,
        } as unknown as Json;
        change("offering");
      }
      window.parent.postMessage(
        {
          channel: "audiframe",
          bootstrap: 1,
          type: "connect/accept",
          nonce,
          payload: acceptance,
        },
        origin,
      );
    } else if (b.type === "connect/bind") {
      if (
        b.nonce !== nonce ||
        event.origin !== origin ||
        session ||
        event.ports.length !== 1
      ) {
        for (const p of event.ports) p.close();
        return;
      }
      const p = b.payload as unknown as {
        sessionId: string;
        version: typeof VERSION;
        grants: Grant[];
        limits: Limits;
      };
      if (
        p.version.major !== 1 ||
        p.version.minor !== 0 ||
        !p.grants.some((g) => g.id === "lifecycle") ||
        p.grants.some(
          (g) =>
            !options.manifest.capabilities.some(
              (c) => c.id === g.id && c.version === g.version,
            ),
        )
      ) {
        event.ports[0].close();
        return;
      }
      ready(event.ports[0], p.sessionId, p.grants, p.limits);
    }
  };
  return {
    connect() {
      if (!started) {
        started = true;
        window.addEventListener("message", listen);
      }
    },
    get state() {
      return state;
    },
    get connected() {
      return !!session && !session.closed;
    },
    get clock() {
      return clock;
    },
    markStateDirty() {
      clearTimeout(timer);
      if (state === "active") timer = setTimeout(publish, 600);
    },
    sendMidi(events: MidiEvent[]) {
      if (
        state !== "active" ||
        !policy?.enabled ||
        !policy.midiOutputEnabled ||
        !session
      )
        return false;
      validatePorts(events, options.manifest, session.grants, "out");
      session.notify("midi/batch", { events: events as unknown as Json });
      return true;
    },
    request<T = Json>(
      type: string,
      payload: Json,
      opts?: RequestOptions,
    ): Promise<T> {
      return session
        ? session.request(type, payload, opts)
        : Promise.reject(new AudiframeError("DISCONNECTED"));
    },
    requestResize(width: number, height: number, opts?: RequestOptions) {
      return this.request("ui/resize", { width, height }, opts);
    },
    notify(type: string, payload: Json) {
      if (type === "events/batch") {
        if (state !== "active" || !policy?.enabled || !policy.midiOutputEnabled)
          throw new AudiframeError("STALE_EPOCH");
        validateEvents(
          (payload as unknown as { events: MusicalEvent[] }).events,
          options.manifest,
          session?.grants ?? [],
          "out",
        );
      }
      if (!session) throw new AudiframeError("DISCONNECTED");
      session.notify(type, payload);
    },
    dispose() {
      window.removeEventListener("message", listen);
      started = false;
      try {
        session?.notify("session/close", { reason: "Disposed" });
      } catch {}
      reset();
      nonce = "";
      origin = "";
      change("closing");
    },
  };
}
