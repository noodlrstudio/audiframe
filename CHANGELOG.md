# Changelog

## Unreleased

- Type declarations work with `"module": "NodeNext"`. Relative imports in the
  packages now carry `.js` extensions, so the emitted `.d.ts` files no longer
  re-export from extensionless paths (`export * from "./types"`), which
  NodeNext couldn't follow: in ESM TypeScript projects every
  `@audiframe/protocol` export looked missing. No runtime, API or protocol
  change; bundles are the same size. `tests/types.test.mjs` type-checks a
  NodeNext consumer against all five packages.

## 0.1.0-alpha.2 (2026-10-23)

First release published by the Release workflow (`release.yml`) with npm
trusted publishing, so `@audiframe/protocol`, `client` and `host` carry
provenance. No SDK or protocol changes since 0.1.0-alpha.1.

## 0.1.0-alpha.1 (2026-10-23)

Initial host-neutral protocol candidate, ESM SDKs/types, operation schemas and
golden fixtures, independent host and browser conformance runner. Reference
Pulse client and Noodlr Board opt-in host are delivered as separate changes.
Files/assets and ecosystem wrappers remain unsupported. No stable badge.

- Host `restore()` and `startFresh()` accept an optional `lifecycle` policy, so
  disabled or muted embeddings are never activated as enabled and audible.
