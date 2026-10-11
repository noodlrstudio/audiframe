import {
  AudiframeError,
  asAudiframeError,
  VERSION,
  LIMITS,
  id,
  type Envelope,
  type Grant,
  type Json,
  type Limits,
} from "./types";
import { parseEnvelope } from "./validate";
import { capabilityFor, OPERATIONS } from "./operations";
import { assertSchema } from "./schema";
export type Handler = (
  payload: Json,
  signal: AbortSignal,
) => Json | Promise<Json>;
export interface RequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}
export interface SessionOptions {
  port: MessagePort;
  sessionId: string;
  role: "host" | "client";
  grants: Grant[];
  limits?: Limits;
  onNotification?: (type: string, payload: Json) => void;
  onClose?: () => void;
  onError?: (code: string) => void;
}
export function narrower(next: Grant[], previous: Grant[]): boolean {
  return (
    new Set(next.map((g) => g.id)).size === next.length &&
    next.every((g) =>
      previous.some(
        (p) =>
          p.id === g.id &&
          p.version === g.version &&
          JSON.stringify(p.options ?? {}) === JSON.stringify(g.options ?? {}),
      ),
    )
  );
}
export class Session {
  readonly handlers = new Map<string, Handler>();
  readonly counters = { invalid: 0, dropped: 0 };
  grants: Grant[];
  closed = false;
  private seq = 0;
  private received = 0;
  private pending = new Map<
    string,
    {
      type: string;
      resolve: (v: Json) => void;
      reject: (e: unknown) => void;
      clean: () => void;
    }
  >();
  private completed = new Map<
    string,
    {
      fingerprint: string;
      promise: Promise<{
        payload?: Json;
        error?: ReturnType<AudiframeError["wire"]>;
      }>;
      created: number;
      controller: AbortController;
    }
  >();
  private queue: Promise<unknown> = Promise.resolve();
  private limits: Limits;
  private buckets = new Map<string, { tokens: number; at: number }>();
  constructor(private options: SessionOptions) {
    this.grants = options.grants;
    this.limits = options.limits ?? LIMITS;
    options.port.onmessage = (e) => {
      void this.receive(e.data);
    };
    options.port.onmessageerror = () => this.close();
    options.port.start();
    this.handlers.set("session/ping", () => ({
      receivedAtMs: performance.now(),
      sentAtMs: performance.now(),
    }));
  }
  private allowed(type: string, sender: "host" | "client"): void {
    const op = Object.hasOwn(OPERATIONS, type) ? OPERATIONS[type] : undefined;
    if (!op) throw new AudiframeError("UNSUPPORTED_OPERATION");
    if (op.sender !== "either" && op.sender !== sender)
      throw new AudiframeError("CAPABILITY_DENIED");
    const cap = capabilityFor(type, sender);
    if (
      cap === "files"
        ? !this.grants.some(
            (g) => g.id === "files.import" || g.id === "files.export",
          )
        : cap && !this.grants.some((g) => g.id === cap)
    )
      throw new AudiframeError("CAPABILITY_DENIED");
  }
  private rate(e: Envelope): void {
    if (e.kind === "response") return;
    const musical = e.type === "midi/batch" || e.type === "events/batch";
    const group = musical
      ? "events"
      : e.type.startsWith("state/")
        ? "state"
        : e.type.startsWith("session/") || e.type === "request/cancel"
          ? "session"
          : "control";
    const capacity = musical
      ? this.limits.eventBurst
      : group === "state"
        ? 10
        : 60;
    const speed = musical ? this.limits.eventsPerSecond : capacity;
    const cost = musical ? (e.payload as { events: Json[] }).events.length : 1;
    if (musical && cost > this.limits.batch)
      throw new AudiframeError("QUOTA_EXCEEDED");
    const now = performance.now();
    const b = this.buckets.get(group) ?? { tokens: capacity, at: now };
    b.tokens = Math.min(capacity, b.tokens + ((now - b.at) * speed) / 1000);
    b.at = now;
    this.buckets.set(group, b);
    if (b.tokens < cost) throw new AudiframeError("RATE_LIMITED");
    b.tokens -= cost;
  }
  private send(
    kind: Envelope["kind"],
    type: string,
    payload?: Json,
    requestId?: string,
    error?: Envelope["error"],
  ): void {
    if (this.closed) throw new AudiframeError("DISCONNECTED");
    const e: Envelope = {
      channel: "audiframe",
      version: VERSION,
      sessionId: this.options.sessionId,
      seq: ++this.seq,
      kind,
      type,
      ...(requestId ? { requestId } : {}),
      ...(error ? { error } : { payload: payload ?? null }),
    };
    parseEnvelope(e, this.limits);
    this.options.port.postMessage(e);
  }
  notify(type: string, payload: Json): void {
    this.allowed(type, this.options.role);
    this.send("notification", type, payload);
  }
  request<T = Json>(
    type: string,
    payload: Json,
    options: RequestOptions = {},
  ): Promise<T> {
    try {
      this.allowed(type, this.options.role);
      if (this.pending.size >= this.limits.pending)
        throw new AudiframeError("QUOTA_EXCEEDED");
      if (options.signal?.aborted) throw new AudiframeError("CANCELLED");
    } catch (e) {
      return Promise.reject(e);
    }
    const requestId = id();
    return new Promise<T>((resolve, reject) => {
      const cancel = (code: string) => {
        const p = this.pending.get(requestId);
        if (!p) return;
        p.clean();
        this.pending.delete(requestId);
        reject(new AudiframeError(code));
        try {
          this.notify("request/cancel", { requestId });
        } catch {}
      };
      const abort = () => cancel("CANCELLED");
      const timer = setTimeout(
        () => cancel("TIMEOUT"),
        options.timeoutMs ??
          (type === "state/set"
            ? 5000
            : type === "files/import"
              ? 60000
              : 2000),
      );
      const clean = () => {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
      };
      this.pending.set(requestId, {
        type,
        resolve: (v) => resolve(v as T),
        reject,
        clean,
      });
      options.signal?.addEventListener("abort", abort, { once: true });
      try {
        this.send("request", type, payload, requestId);
      } catch (e) {
        clean();
        this.pending.delete(requestId);
        reject(e);
      }
    });
  }
  private async receive(value: unknown): Promise<void> {
    if (this.closed) return;
    let e: Envelope;
    try {
      e = parseEnvelope(value, this.limits);
      if (e.sessionId !== this.options.sessionId || e.seq <= this.received)
        throw new AudiframeError("INVALID_MESSAGE");
      this.received = e.seq;
    } catch {
      this.violation("INVALID_MESSAGE");
      return;
    }
    if (e.kind === "response") {
      const p = this.pending.get(e.requestId!);
      if (!p) return;
      if (p.type !== e.type) {
        this.violation("INVALID_MESSAGE");
        return;
      }
      p.clean();
      this.pending.delete(e.requestId!);
      if (e.error)
        p.reject(
          new AudiframeError(e.error.code, e.error.message, e.error.retryable),
        );
      else p.resolve(e.payload!);
      return;
    }
    if (e.kind === "notification" && !Object.hasOwn(OPERATIONS, e.type)) {
      this.counters.dropped = Math.min(1000000, this.counters.dropped + 1);
      return;
    }
    try {
      this.allowed(e.type, this.options.role === "host" ? "client" : "host");
      this.rate(e);
      if (e.type === "request/cancel") {
        this.completed
          .get((e.payload as { requestId: string }).requestId)
          ?.controller.abort();
        return;
      }
      if (e.type === "session/close") {
        this.close();
        return;
      }
      if (e.type === "session/grants") {
        const g = (e.payload as unknown as { grants: Grant[] }).grants;
        if (!narrower(g, this.grants))
          throw new AudiframeError("CAPABILITY_DENIED");
        this.grants = g;
        for (const c of this.completed.values()) c.controller.abort();
      }
      if (e.kind === "notification") {
        this.options.onNotification?.(e.type, e.payload!);
        return;
      }
      const fingerprint = JSON.stringify([e.type, e.payload]);
      for (const [k, c] of this.completed)
        if (performance.now() - c.created > 30000) this.completed.delete(k);
      let result = this.completed.get(e.requestId!);
      if (result && result.fingerprint !== fingerprint)
        throw new AudiframeError("INVALID_MESSAGE", "Request ID reused");
      if (!result) {
        if (this.completed.size >= 128)
          throw new AudiframeError("QUOTA_EXCEEDED");
        const controller = new AbortController();
        const handler = this.handlers.get(e.type);
        if (!handler) throw new AudiframeError("UNSUPPORTED_OPERATION");
        const execute = async () => {
          try {
            this.allowed(
              e.type,
              this.options.role === "host" ? "client" : "host",
            );
            if (controller.signal.aborted)
              throw new AudiframeError("CANCELLED");
            const payload = await handler(e.payload!, controller.signal);
            assertSchema(OPERATIONS[e.type].output ?? {}, payload);
            return { payload };
          } catch (err) {
            return { error: asAudiframeError(err).wire() };
          }
        };
        const promise = this.queue.then(execute);
        this.queue = promise.then(() => {});
        result = {
          fingerprint,
          promise,
          controller,
          created: performance.now(),
        };
        this.completed.set(e.requestId!, result);
      }
      const r = await result.promise;
      if (!this.closed)
        this.send("response", e.type, r.payload, e.requestId, r.error);
    } catch (err) {
      const error = asAudiframeError(err);
      if (e.kind === "request") {
        try {
          this.send("response", e.type, undefined, e.requestId, error.wire());
        } catch {
          this.close();
        }
      } else this.violation(error.code);
    }
  }
  private violation(code: string): void {
    this.counters.invalid++;
    this.counters.dropped++;
    this.options.onError?.(code);
    if (this.counters.invalid >= 8) this.close();
  }
  narrow(grants: Grant[], reason = "Policy changed"): void {
    if (!narrower(grants, this.grants))
      throw new AudiframeError("CAPABILITY_DENIED");
    this.notify("session/grants", {
      grants: grants as unknown as Json,
      reason,
    });
    this.grants = grants;
    for (const c of this.completed.values()) c.controller.abort();
  }
  close(reason = "Disconnected"): void {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) {
      p.clean();
      p.reject(new AudiframeError("DISCONNECTED", reason));
    }
    this.pending.clear();
    for (const c of this.completed.values()) c.controller.abort();
    this.completed.clear();
    this.options.port.onmessage = null;
    this.options.port.onmessageerror = null;
    this.options.port.close();
    this.options.onClose?.();
  }
}
