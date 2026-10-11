# Pulse and Noodlr Board integration

Pulse is the actual upstream application, credited **Pulse · Chris Thomaidis**.
Source baseline: `5of12/Pulse` commit
`8cbbd401587682a69327a9932739aadb805e0df7` (see examples/pulse/README.md).
It is not vendored here. Its integration imports the pinned client SDK,
keeps detached PulseState validation/migration and stopped restore, and selects
one protocol for each embedding. Transport and parameters are not advertised.
The manifest identity remains `co.uk.5of12.pulse`.

To run against the separate Pulse integration checkout:

```sh
# Pulse checkout: npm ci && npm run dev (port 3000)
# audiframe checkout: npm ci && npm run build && npm run dev
```

Open `http://127.0.0.1:4100/examples/pulse/`. Save, change and recall BPM/patterns;
reload the iframe and recall. User activation inside Pulse still enables audio.
Use `?audiframe=1&midiOnly=1` when routing sequencer output to another instrument,
so Pulse's local synthesis does not double the external drum sound. Notes use
channel 10. Audio capture in a native host is a separate mechanism.

Noodlr Board integration is opt-in: append `audiframe=1` to an app's URL.
The Web App node uses the host SDK, the existing graph ports and save snapshot
registry. Legacy URLs keep their existing bridge. Persisted snapshot provenance
is separate `audiframeBinding: {origin,appId}` metadata next to `pluginState`;
the state envelope remains unchanged. Unbound or wrong-origin saved state is
blocked and retained, rather than silently migrated. Create a new node for initial
adoption, or explicitly export/convert retained source through a future migration UI.

The developer route `/developers/audiframe/?app=<encoded URL>` exercises the
same actual Web App component. In development, use
`http://127.0.0.1:3000/?audiframe=1` as the app. Save and reload the route to
verify the snapshot and origin binding. Its storage is local sessionStorage;
normal board persistence continues through existing document save callbacks.

Package archives in each consuming repo's vendor/audiframe directory make the
alpha reproducible without npm publishing, sibling absolute paths or a CDN.
The archives include MIT notices. Replace them with pinned registry releases
once package names/ownership and the release workflow are approved.

No Supabase migration, Edge Function, bucket, secret or configuration action is
needed for this opt-in integration. The existing opaque board JSON stores the
additional binding metadata; schema conversion is deliberately explicit.
