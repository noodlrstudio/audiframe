import {
  AudiframeError,
  Session,
  LIMITS,
  VERSION,
  id,
  nonceId,
  originOf,
  parseBootstrap,
  validateManifest,
  validateSnapshot,
  validatePorts,
  validateEvents,
  validateTimeline,
  jsonBytes,
  assertSchema,
  grantSchema,
  arr,
  limitsSchema,
  narrower,
  type Grant,
  type Manifest,
  type Snapshot,
  type Json,
  type Limits,
  type Lifecycle,
  type MidiEvent,
  type Timeline,
  type ConnectionState,
  type RequestOptions,
  type MusicalEvent,
} from "@audiframe/protocol";
export interface HostOptions {
  iframe: HTMLIFrameElement;
  url: string;
  development?: boolean;
  host?: { id: string; name: string; version: string };
  capabilities?: string[];
  policy?: (manifest: Manifest) => Grant[];
  limits?: Partial<Limits>;
  onState?: (state: ConnectionState) => void;
  onSnapshot?: (snapshot: Snapshot, revision: number, epoch: string) => void;
  onMidi?: (events: MidiEvent[]) => void;
  onPanic?: () => void;
  onError?: (code: string) => void;
  handlers?: Record<
    string,
    (payload: Json, signal: AbortSignal) => Json | Promise<Json>
  >;
}
export function createHostSession(options: HostOptions) {
  const origin = originOf(options.url, options.development);
  if (origin === window.location.origin)
    throw new AudiframeError(
      "INVALID_VALUE",
      "Reference host requires a separate app origin",
    );
  const limits = { ...LIMITS, ...options.limits };
  assertSchema(limitsSchema, limits);
  let state: ConnectionState = "idle";
  let session: Session | undefined;
  let manifest: Manifest | undefined;
  let nonce = "";
  let epoch = "";
  let revision = -1;
  let generation = 0;
  let attempts = 0;
  let offerTimer: ReturnType<typeof setInterval> | undefined;
  let bindTimer: ReturnType<typeof setTimeout> | undefined;
  let resolveConnect: (() => void) | undefined;
  let rejectConnect: ((e: unknown) => void) | undefined;
  let connecting: Promise<void> | undefined;
  const change = (s: ConnectionState) => {
    state = s;
    options.onState?.(s);
  };
  const clear = () => {
    clearInterval(offerTimer);
    clearTimeout(bindTimer);
  };
  const invalidate = () => {
    clear();
    generation++;
    epoch = "";
    revision = -1;
    nonce = "";
    session?.close();
    session = undefined;
    manifest = undefined;
    connecting = undefined;
    rejectConnect?.(new AudiframeError("DISCONNECTED"));
    resolveConnect = undefined;
    rejectConnect = undefined;
    options.onPanic?.();
  };
  const offer = () => {
    if (attempts++ >= 6) {
      clear();
      change("unavailable");
      rejectConnect?.(new AudiframeError("TIMEOUT", "App unavailable"));
      connecting = undefined;
      return;
    }
    options.iframe.contentWindow?.postMessage(
      {
        channel: "audiframe",
        bootstrap: 1,
        type: "connect/offer",
        nonce,
        payload: {
          versions: [VERSION],
          host: options.host ?? {
            id: "org.audiframe.host",
            name: "audiframe host",
            version: "0.1.0",
          },
          requestedCapabilities: options.capabilities ?? [
            "lifecycle",
            "state.snapshot",
            "midi.input",
            "midi.output",
            "ui.resize",
          ],
        },
      },
      origin,
    );
  };
  const connect = (): Promise<void> => {
    if (session && !session.closed) return Promise.resolve();
    if (connecting) return connecting;
    nonce = nonceId();
    attempts = 0;
    change("offering");
    connecting = new Promise((resolve, reject) => {
      resolveConnect = resolve;
      rejectConnect = reject;
    });
    offer();
    offerTimer = setInterval(offer, 500);
    return connecting;
  };
  const listen = (event: MessageEvent) => {
    if (
      event.source !== options.iframe.contentWindow ||
      event.origin !== origin ||
      state !== "offering"
    )
      return;
    let b;
    try {
      b = parseBootstrap(event.data);
    } catch {
      return;
    }
    if (b.nonce !== nonce) return;
    if (b.type === "connect/reject") {
      clear();
      change("rejected");
      rejectConnect?.(new AudiframeError((b.payload as { code: string }).code));
      connecting = undefined;
      return;
    }
    if (b.type !== "connect/accept" || event.ports.length) return;
    try {
      const p = b.payload as unknown as {
        selectedVersion: typeof VERSION;
        app: Manifest;
      };
      if (p.selectedVersion.major !== 1 || p.selectedVersion.minor !== 0)
        throw new AudiframeError("UNSUPPORTED_VERSION");
      validateManifest(p.app);
      if (!p.app.protocolVersions.some((v) => v.major === 1 && v.minor >= 0))
        throw new AudiframeError("UNSUPPORTED_VERSION");
      manifest = p.app;
      const supported = options.capabilities ?? [
        "lifecycle",
        "state.snapshot",
        "midi.input",
        "midi.output",
        "ui.resize",
      ];
      const proposed =
        options.policy?.(manifest) ??
        manifest.capabilities
          .filter((c) => supported.includes(c.id))
          .map(({ id, version, options }) => ({
            id,
            version,
            ...(options ? { options } : {}),
          }));
      const grants = proposed.filter(
        (g) =>
          supported.includes(g.id) &&
          manifest!.capabilities.some(
            (c) => c.id === g.id && c.version === g.version,
          ),
      );
      if (
        new Set(grants.map((g) => g.id)).size !== grants.length ||
        !grants.some((g) => g.id === "lifecycle") ||
        manifest.capabilities.some(
          (c) => c.required && !grants.some((g) => g.id === c.id),
        )
      )
        throw new AudiframeError("CAPABILITY_DENIED");
      jsonBytes(grants, 14000, 16);
      assertSchema(arr(grantSchema, 32), grants);
      clear();
      change("binding");
      const channel = new MessageChannel();
      const sessionId = id();
      session = new Session({
        port: channel.port1,
        sessionId,
        role: "host",
        grants,
        limits,
        onError: options.onError,
        onClose: () => {
          clear();
          generation++;
          epoch = "";
          change("unavailable");
          options.onPanic?.();
          rejectConnect?.(new AudiframeError("DISCONNECTED"));
          connecting = undefined;
        },
        onNotification: (type, payload) => {
          if (type === "session/ready") {
            if (state !== "binding") return;
            const accepted = (payload as { acceptedGrants: string[] })
              .acceptedGrants;
            if (
              new Set(accepted).size !== accepted.length ||
              accepted.some((c) => !grants.some((g) => g.id === c)) ||
              !accepted.includes("lifecycle")
            ) {
              session?.close();
              return;
            }
            session!.grants = grants.filter((g) => accepted.includes(g.id));
            clear();
            change("connected");
            resolveConnect?.();
            resolveConnect = undefined;
            rejectConnect = undefined;
            connecting = undefined;
          }
          if (type === "state/changed") {
            const p = payload as unknown as {
              snapshot: Snapshot;
              revision: number;
              epoch: string;
            };
            if (
              state !== "active" ||
              p.epoch !== epoch ||
              p.revision <= revision
            )
              return;
            validateSnapshot(p.snapshot, manifest!);
            revision = p.revision;
            options.onSnapshot?.(p.snapshot, p.revision, p.epoch);
          }
          if (type === "events/batch")
            validateEvents(
              (payload as unknown as { events: MusicalEvent[] }).events,
              manifest!,
              session!.grants,
              "out",
            );
          if (type === "midi/batch") {
            if (state !== "active") return;
            const events = (payload as unknown as { events: MidiEvent[] })
              .events;
            validatePorts(events, manifest!, session!.grants, "out");
            options.onMidi?.(events);
          }
        },
      });
      for (const [type, handler] of Object.entries(options.handlers ?? {}))
        session.handlers.set(type, handler);
      session.handlers.set("ui/resize", (payload) => {
        const p = payload as { width: number; height: number };
        const width = Math.min(
          p.width,
          manifest!.ui?.maxWidth ?? 1920,
          Math.max(1, window.innerWidth),
        );
        const height = Math.min(
          p.height,
          manifest!.ui?.maxHeight ?? 1080,
          Math.max(1, window.innerHeight),
        );
        options.iframe.style.width = `${width}px`;
        options.iframe.style.height = `${height}px`;
        return { width, height, accepted: true };
      });
      options.iframe.title = options.iframe.title || manifest.name;
      options.iframe.contentWindow!.postMessage(
        {
          channel: "audiframe",
          bootstrap: 1,
          type: "connect/bind",
          nonce,
          payload: { sessionId, version: VERSION, grants, limits },
        },
        origin,
        [channel.port2],
      );
      bindTimer = setTimeout(() => {
        change("unavailable");
        rejectConnect?.(new AudiframeError("TIMEOUT"));
        session?.close();
      }, 2000);
    } catch (e) {
      clear();
      change("rejected");
      rejectConnect?.(e);
      connecting = undefined;
    }
  };
  const load = () => {
    invalidate();
    void connect().catch(() => {});
  };
  window.addEventListener("message", listen);
  options.iframe.addEventListener("load", load);
  const requireSession = () => {
    if (!session || session.closed) throw new AudiframeError("DISCONNECTED");
    return session;
  };
  const api = {
    connect,
    get state() {
      return state;
    },
    get manifest() {
      return manifest;
    },
    get grants() {
      return session?.grants ?? [];
    },
    async restore(snapshot: Snapshot, opts?: RequestOptions) {
      const current = requireSession();
      validateSnapshot(snapshot, manifest!);
      const g = ++generation;
      const next = id();
      epoch = "";
      change("restoring");
      try {
        const r = await current.request<{ epoch: string; revision: number }>(
          "state/set",
          { snapshot: snapshot as unknown as Json, epoch: next },
          opts,
        );
        if (g !== generation || current !== session)
          throw new AudiframeError("DISCONNECTED");
        if (r.epoch !== next) throw new AudiframeError("STALE_EPOCH");
        epoch = next;
        revision = r.revision;
        await api.setLifecycle({
          mode: "active",
          enabled: true,
          audible: true,
          midiOutputEnabled: true,
          visible: true,
        });
      } catch (e) {
        if (g === generation) change("restore-blocked");
        throw e;
      }
    },
    async startFresh(opts?: RequestOptions) {
      epoch = id();
      revision = -1;
      generation++;
      await api.setLifecycle(
        {
          mode: "active",
          enabled: true,
          audible: true,
          midiOutputEnabled: true,
          visible: true,
          stateEpoch: epoch,
        },
        opts,
      );
    },
    async getState(opts?: RequestOptions): Promise<Snapshot> {
      if (state !== "active") throw new AudiframeError("STALE_EPOCH");
      const current = requireSession();
      const g = generation;
      const r = await current.request<{ snapshot: Snapshot; revision: number }>(
        "state/get",
        {},
        opts,
      );
      if (g !== generation || session !== current)
        throw new AudiframeError("STALE_EPOCH");
      validateSnapshot(r.snapshot, manifest!);
      if (r.revision >= revision) revision = r.revision;
      return r.snapshot;
    },
    async setLifecycle(policy: Lifecycle, opts?: RequestOptions) {
      if (policy.mode === "active" && !epoch && !policy.stateEpoch)
        throw new AudiframeError("STALE_EPOCH");
      const current = requireSession();
      const g = generation;
      const r = await current.request(
        "lifecycle/set",
        policy as unknown as Json,
        opts,
      );
      if (current !== session || g !== generation)
        throw new AudiframeError("DISCONNECTED");
      if (policy.mode !== "active" || !policy.midiOutputEnabled)
        options.onPanic?.();
      change(
        policy.mode === "active"
          ? "active"
          : policy.mode === "suspended"
            ? "suspended"
            : "closing",
      );
      return r;
    },
    sendMidi(events: MidiEvent[]) {
      if (state !== "active") throw new AudiframeError("STALE_EPOCH");
      validatePorts(events, manifest!, requireSession().grants, "in");
      requireSession().notify("midi/batch", {
        events: events as unknown as Json,
      });
    },
    setTransport(timeline: Timeline) {
      if (state !== "active") throw new AudiframeError("STALE_EPOCH");
      validateTimeline(timeline);
      requireSession().notify("transport/update", timeline as unknown as Json);
    },
    notify(type: string, payload: Json) {
      if (type === "events/batch") {
        if (state !== "active") throw new AudiframeError("STALE_EPOCH");
        validateEvents(
          (payload as unknown as { events: MusicalEvent[] }).events,
          manifest!,
          requireSession().grants,
          "in",
        );
      }
      requireSession().notify(type, payload);
    },
    request<T = Json>(type: string, payload: Json, opts?: RequestOptions) {
      return requireSession().request<T>(type, payload, opts);
    },
    narrowGrants(grants: Grant[]) {
      if (!narrower(grants, requireSession().grants))
        throw new AudiframeError("CAPABILITY_DENIED");
      requireSession().narrow(grants);
      options.onPanic?.();
    },
    invalidateState() {
      generation++;
      epoch = "";
      revision = -1;
      change("connected");
    },
    close() {
      window.removeEventListener("message", listen);
      options.iframe.removeEventListener("load", load);
      try {
        session?.notify("session/close", { reason: "Host closed" });
      } catch {}
      invalidate();
      change("closing");
    },
  };
  return api;
}
