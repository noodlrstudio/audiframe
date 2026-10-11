# Noodlr Board audiframe integration — alpha

This implementation selects audiframe only for URLs explicitly containing
`audiframe=1`. Other Web App nodes retain legacy v1/v2 behavior. Pulse advertises
only lifecycle, state and MIDI; neither transport follow nor parameter support
is inferred from the application UI.

The core remains independent. The board consumes pinned ESM package archives,
registers existing graph input/output ports, derives generic lifecycle policies,
and captures snapshots through the existing explicit-save registry. Opaque
`pluginState` is a standard snapshot envelope; adjacent `audiframeBinding` stores
approved origin and app ID. A changed origin, unbound snapshot, mismatched ID,
unsupported schema or failed restore cannot overwrite retained source state.
There is no automatic legacy conversion. Initial rollout uses new opt-in nodes;
a future explicit conversion UI retains/exportable original data.

The `/developers/audiframe/` example uses the real Web App component and local
session storage, including save/reload recall. Normal board saves continue
through the existing document persistence path. No migration, Edge Function,
bucket, secret or Supabase configuration is needed.

Deployment order: merge/test audiframe source, review its public history and
publish the repository; merge and deploy Pulse client; merge and deploy Noodlr
opt-in host. Keep legacy URLs and saved state available for rollback. Registry
publishing is optional and needs package ownership verification. Do not claim
stable 1.0, files/assets, physical device acceptance or sample accuracy from
an alpha SDK/browser test.

See [integration details](docs/integrations.md) and
[measured validation](docs/validation.md).
