# Validation and release scope

Local evidence collected 11 October 2026, Node 24.11.0 / npm 11.16.0 on macOS.
This is an alpha implementation record, not stable 1.0 certification.

| Evidence                                                            | Result                                                                                                                       |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Clean audiframe npm install, TypeScript, unit/session/adapter tests | PASS: 21 tests                                                                                                               |
| Golden operation/bootstrap success/error corpus                     | PASS: 89 wire fixtures                                                                                                       |
| Chromium two-origin runner                                          | PASS: 103 fixture/runtime checks                                                                                             |
| WebKit two-origin runner                                            | PASS: 103 fixture/runtime checks                                                                                             |
| Firefox on this Mac                                                 | BLOCKED: launch/profile and OS sandbox failures, including after browser installation                                        |
| Core browser bundles                                                | Client 8,374 bytes gzip; host 8,178 bytes gzip, below 15 KiB each                                                            |
| Actual Pulse in independent vanilla host                            | PASS: identity, BPM 137 recall, malformed restore blocks and retry recovers                                                  |
| Actual Pulse in Noodlr Web App component                            | PASS: saved BPM 143 and origin/app binding; reload recalls 143                                                               |
| Pulse validation                                                    | PASS: typecheck, 23 tests and production build                                                                               |
| Noodlr validation                                                   | PASS: typecheck, focused host/appearance tests, source-size smoke, production build; existing warnings remain                |
| Noodlr format                                                       | `npm run format:write` run; format check passes                                                                              |
| Audio output                                                        | NOT VERIFIED: automated Pulse analyser returned zero; AudioContext reported running while its measured clock did not advance |
| Physical Safari/iOS, hardware MIDI, native/DAW recording            | NOT RUN                                                                                                                      |
| Deployed Pulse/Noodlr sites and npm publication                     | NOT RUN                                                                                                                      |
| Independent security review and external SDK/host feedback          | OPEN                                                                                                                         |

The runner covers golden schemas, actual SDK negotiation/epochs, state round trip,
failed/future-schema recall, parameter batch rejection and reads after recall,
revocation, navigation invalidation, denied state, and independent wire peers
for rejection, wrong nonce, readiness timeout, stale session and abusive traffic.
Unit tests cover UTF-8/depth/finite JSON, response exclusivity, identity/schema,
MIDI packets/velocity-zero, cancellation, disconnect, duplicate request replay,
mutation serialization, routing/dedup/panic, scheduled release ordering and clock
arithmetic. These checks do not replace the full beta threat/fuzz/timing suite.

CLI reports distinguish wire validation from runtime profiles. Only tested
reference builds are covered, not arbitrary remote website deployments.
Files/assets and ecosystem wrappers are unsupported. Parameters/events/transport/UI
have protocol primitives and handler hooks; complete app profile behavior still
requires application handlers and profile-specific acceptance. Pulse advertises
only implemented state, lifecycle and virtual MIDI.

CI runs schema/type/fixture drift, unit tests, size ceilings and Chromium,
Firefox and WebKit browser jobs. Local Firefox launch failure is not a pass;
remote CI must supply its own evidence before release. Public source readiness
is separate from changing the currently private repository's visibility.

No Supabase migration, Edge Function, bucket, secret or configuration action
is needed for the opt-in host integration. Legacy source state is retained.
