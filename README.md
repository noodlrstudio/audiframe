# audiframe

A small, host-neutral protocol for independently hosted web music applications.
An app keeps its own UI, state and audio engine. An embedding host negotiates
capabilities and communicates over an authenticated MessagePort.

**Draft 0.1 / protocol 1.0 candidate. Not a stable standard or certification.**
No account, registry, CDN, framework, Noodlr dependency or shared AudioContext is required.

## Try it

```sh
nvm use
npm ci
npm run check
npm test
npm run conformance
npm run size
npm run dev
```

Open `http://127.0.0.1:4100/examples/minimal-host/`. The instrument runs on
port 4101, a separate origin. Save, edit and recall its pattern. Open
`http://127.0.0.1:4100/packages/conformance/browser/` for the browser runner.
Run `npm run test:browser -- chrome` with the example server running; Firefox
and WebKit use the same runner. CI uploads reports for each engine.

## Packages

| Package                     | Responsibility                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `@audiframe/protocol`       | Types, bounded JSON validation, operation schemas, errors, session dispatcher, MIDI/clock/parameter helpers |
| `@audiframe/client`         | Parent authentication, binding, atomic restore hooks, epoch gate, app lifecycle                             |
| `@audiframe/host`           | Frame authentication, negotiation, grants, recall, navigation invalidation                                  |
| `@audiframe/conformance`    | Golden fixture CLI and independent two-origin browser runner                                                |
| `@audiframe/adapter-noodlr` | Explicit legacy snapshot and runtime translation; loss descriptor                                           |

Packages are ESM with TypeScript declarations. `npm run build` also produces
self-contained browser modules in each package's `dist/index.js`. Serve your
own pinned copies. Build and `npm pack -w @audiframe/client` to consume locally.
The packages are not yet published to npm; names and ownership need checking
before the first release. Each host/client bundle is checked against 15 KiB gzip.

Read [SDK usage](docs/sdk.md), [protocol inventory](spec/README.md),
[integration guide](docs/integrations.md), [release evidence](docs/validation.md),
[security policy](SECURITY.md), and [contribution policy](CONTRIBUTING.md).
The [product spec](audiframe-open-standard-product-spec.md) records the intended
1.0 standard and later release gates. Schemas and fixtures remain draft.

## Limits and truthful profiles

The runtime implements authenticated bootstrap, bounded ordered envelopes,
request cancellation/timeouts/idempotency, grants and revocation, lifecycle,
state epochs and recall, virtual MIDI, event schema validation, clock helpers,
transport dispatch, parameters and UI operations. Advertise only handlers your
app actually implements. `connected` does not mean recalled or audio unlocked.
State setters must validate a detached candidate and apply atomically; the SDK
cannot roll back mutations an app performs before throwing.

Files have draft operation schemas and denied-capability fixtures, but binary
transfer and chooser orchestration are **not implemented**. Do not grant file
capabilities. Durable assets and WAM/WebCLAP/Wafer adapters remain RFC work.
Profile reports separate wire validation from end-to-end runtime proof;
passing fixtures does not establish timing, audio, device or deployed-site conformance.

The transport is best effort on the control thread, not sample accurate.
Audio stays in the app. Browser user activation, CSP, sandbox and device
permissions still apply. A cooperative mute is not a security boundary.

Implementation: MIT. Specification and schemas: [CC BY 4.0](spec/LICENSE.md).
No standards-body endorsement or central telemetry.
