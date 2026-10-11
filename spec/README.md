# Protocol 1.0 candidate

The source [product specification](../audiframe-open-standard-product-spec.md)
is the prose baseline. The JSON Schema files in `schemas/` describe manifest,
bootstrap, snapshot, envelope and every operation input/output from its registry.
`packages/protocol/src/operations.ts` is the generation source. Run
`npm run schemas` and `npm run fixtures`; CI rejects drift.

Runtime uses the same bounded schema subset: object/array/scalar types, required,
const, enum, oneOf, anyOf, not, pattern, length/item/numeric limits. Unknown optional
properties are accepted. All values must also be plain finite bounded JSON;
JSON Schema alone cannot encode these JavaScript sender constraints.

The full envelope discriminator, requestId and response payload/error exclusivity,
negotiated session/sequence, identity/schema matching, capability direction and
port grants are enforced by runtime validators. Snapshot size counts the entire
state wire envelope. Epoch/revision checks are host/client session requirements.
These semantic constraints accompany the schemas and are normative for this draft.

File chunk schemas describe a future transfer exception; the current parser
accepts only JSON and the SDK does not implement binary transfer. File profiles
must remain denied. See [files RFC](rfcs/0001-files-and-assets.md). Never interpret
an opaque snapshot URL as a permission to fetch or expose host assets.

## Compatibility

Bootstrap: `channel: audiframe`, `bootstrap: 1`; protocol major/minor: `1.0`.
App state schema versions and capability versions are independent. Host and app
must implement lifecycle. All other capabilities are optional. Unknown requests
return `UNSUPPORTED_OPERATION`; unknown notifications are counted and ignored,
with repeated unauthorized/invalid traffic closing the peer. No app identity is
a proof of domain ownership: storage must preserve its approved origin separately.

## Changes

Wire fixtures are not frozen for stable 1.0. Breaking draft changes require an
RFC, changed fixtures and changelog before publication. Once 1.0 is tagged,
incompatible changes require a new major version; new optional fields/capabilities
may use a minor version after interoperable tests. Retain tagged specifications
and fixtures permanently. Third-party implementations must be able to use the
wire format without these SDKs or a registry.
