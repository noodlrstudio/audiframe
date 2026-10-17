# RFC 0002: experimental audio output route

Status: draft for discussion; unimplemented; no runtime grants, schemas or
conformance badges. Does not block the 1.0 core release.

## Summary

Define an optional experimental capability, `x.org.audiframe.audio.output`,
that lets an embedded app send its rendered audio to the host so the host can
mix, meter, record or apply effects to it. Audio stays app-owned by default.
Routing is negotiated per session, uses a dedicated audio channel separate
from the control MessagePort, and makes no realtime or sample-accuracy claims.

Audio into an app (effects processing, sidechain) is out of scope. It doubles
the latency budget and needs its own RFC once output evidence exists.

## Motivation

Hosts can already control an embedded app (lifecycle, MIDI, state) but cannot
hear it. A host therefore cannot set relative levels between apps, record or
bounce a session, meter output, or send an app through host effects. Collaborative
hosts such as Noodlr Board want these features for independently hosted apps
without asking each app to become a WAM or other in-graph plugin.

## Non-goals and relationship to the 1.0 scope

- Audio output does not change the 1.0 core. Version 1.0 ships control-only:
  lifecycle, state, MIDI/events, transport, parameters and UI.
- No shared AudioContext, no AudioNode routing across origins, no
  SharedArrayBuffer or cross-origin isolation requirement.
- The 1.0 non-goal "PCM over control messages" stands. Audio never travels in
  session envelopes; it uses a separately negotiated audio channel.
- No sample-accurate alignment with host-native audio. Apps that need
  sample-tight, in-graph DSP should use WAM, CMajor or another plugin format
  through its own adapter; this route does not replace them.
- No guarantee of latency, continuity or synchronisation. Measured figures are
  evidence for a tested build, browser and device, not a promise.

## Capability and negotiation

The app advertises `x.org.audiframe.audio.output` with `version: 1` and options:

```ts
{
  routes: ("pcm-port" | "webrtc")[];   // at least one, in preference order
  maxChannels: 1 | 2;                  // stereo maximum in this draft
  sampleRates: number[];               // rates the app can render, e.g. [48000, 44100]
}
```

The host grants an intersection with exactly one route, one channel count and
one sample rate. Missing means denied, and the app MUST work normally with the
capability denied.

Proposed operations (names provisional, all under the experimental prefix):

| Operation      | Direction  | Purpose                                                      |
| -------------- | ---------- | ------------------------------------------------------------ |
| `audio/open`   | host → app | Create the stream for the granted route; returns stream info |
| `audio/route`  | host → app | Switch between `app-owned` and `host-routed` output          |
| `audio/close`  | either     | Tear down the stream and return to `app-owned`               |
| `audio/status` | app → host | Notification: underruns, buffer level, measured latency      |

### Routed mode and the mute handshake

When routed, the app MUST stop sending the routed signal to its own
`AudioContext.destination`, or the listener hears it twice. Order of cut-over:

1. Host opens the stream and confirms it is receiving and audible on its side.
2. Host sends `audio/route { mode: "host-routed" }`.
3. App disconnects local output, then responds. The host does not assume
   cut-over until the response arrives.

Leaving routed mode reverses the order: the app reconnects local output before
the host stops playback. On stream failure, revocation or disconnect, the app
returns to `app-owned` only if `lifecycle.audible` is still true, so a muted
embedding never becomes audible unexpectedly. The routing mode is host node
configuration; it is never part of app state or snapshots.

## Candidate transports

The RFC does not choose a winner. Both routes must be prototyped and measured
before one becomes the required baseline.

### `pcm-port`: PCM over a dedicated MessagePort

- A new MessageChannel carries only audio. One end is transferred to the app;
  the control port carries no PCM.
- The app captures output in an AudioWorkletProcessor (128-frame render quanta)
  and posts blocks of interleaved or planar Float32Array with transferred
  buffers. Proposed block size: 256–1024 frames, negotiated.
- Each block carries a sequence number and the app's frame counter so the host
  can detect gaps and estimate drift.
- The host plays blocks through its own AudioWorklet from a jitter buffer and
  resamples if rates differ.
- Prototype question: can each side transfer its port end into its
  AudioWorkletGlobalScope so blocks bypass both main threads? If not, main-thread
  stalls on either side become dropouts.

Expected profile: lossless; simple; works in every engine with AudioWorklet;
latency set mostly by block size plus jitter buffer.

### `webrtc`: local RTCPeerConnection loopback

- The app renders into a MediaStreamAudioDestinationNode and sends the track
  over a local RTCPeerConnection. SDP and ICE exchange travel over the control
  port as ordinary bounded messages.
- The host plays the received track through a MediaStreamAudioSourceNode.
- Configure Opus for music (stereo, high bitrate) or negotiate a less lossy
  codec where available. Use `jitterBufferTarget` where supported.

Expected profile: buffering happens off the main thread, so more robust under
load; lossy by default; variable latency from the receiver's jitter buffer.

## Clock and synchronisation

Host and app AudioContexts are separate clocks, possibly at different sample
rates. The host maps app frame counters to its own timeline using the existing
`session/ping` offset estimate plus observed buffer level, and corrects drift by
gentle resampling, never by silent frame drops in steady state. Reported latency
is end-to-end: app render to host output. Routed audio is not aligned with
host-native instruments to better than the measured latency spread.

## Security and privacy

- Audio is data the host can record. Routing requires explicit user action in
  the host UI per embedding; recording routed audio requires its own visible
  indication. Registry listing never implies a grant.
- An app with microphone permission could route microphone audio; the host must
  label routed audio as the app's output, not as a trusted instrument.
- The stream format is fixed by the grant, so bandwidth is bounded (stereo at
  48 kHz Float32 is about 384 KB/s). The host drops blocks that exceed the
  granted format or rate and closes the stream on sustained abuse.
- The host sanitises received samples: NaN and infinity become zero, values are
  clamped before any gain stage.
- Revocation through `session/grants` closes the audio channel immediately. A
  cooperative mute is still not a security boundary; terminating the frame is.

## Compatibility and migration

Additive and optional. Apps and hosts without the capability behave exactly as
today. No change to bootstrap, envelope, state, recall or existing capability
versions. Promotion from `x.org.audiframe.audio.output` to an unprefixed ID
follows the RFC process and a minor protocol version after interoperable tests.

## Errors

Use existing codes: `CAPABILITY_DENIED` (no grant or revoked), `INVALID_VALUE`
(unsupported route, rate or channel count), `QUOTA_EXCEEDED` or `RATE_LIMITED`
(stream exceeds granted format), `USER_GESTURE_REQUIRED` (AudioContext cannot
start), `DISCONNECTED` and `CANCELLED` for teardown.

## Fixtures

Success: grant, open, route to host, status, route back, close, for each route.
Errors: `audio/open` without a grant; unsupported sample rate; blocks before
open; oversized or over-rate blocks; NaN samples sanitised; revocation mid-stream;
muted embedding stays silent after stream failure; duplicate `audio/open`.

## Evidence required before leaving experimental status

Measure in Chromium, Firefox and WebKit, and manually on Safari macOS and iOS:

- end-to-end latency distribution (p50, p95, p99) using an impulse loopback;
- dropouts per minute idle, under main-thread load on each side, and with the
  host tab backgrounded;
- drift and buffer level over a 30-minute session;
- CPU cost per routed app and with several apps routed at once;
- audible output proved separately from message delivery.

Publish these per route in the conformance report as an `audio.output` profile
with build digest, browser, OS, device and date. Discovery catalogues such as
WebAudioHub may display the measured figures for a tested release, never as a
guarantee and never as a substitute for a tested status.

Acceptance: both routes prototyped; one selected as the required baseline;
Pulse routed into Noodlr Board and the vanilla reference host; all fixtures pass
in independent host and client implementations; security review complete.

## Open questions

1. Which route becomes the baseline, and is the other kept as optional?
2. Are multiple outputs per app (stems, per-port audio) needed in version 1?
3. How does a collaborative host record or share routed audio between
   participants without duplicating each peer's stream?
4. Does binary transfer reuse the machinery planned for files (RFC 0001)?
5. Should the host expose routed latency to the app so it can compensate its own
   scheduling?
