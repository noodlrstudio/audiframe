# audiframe agent guide

audiframe is a small, host-neutral protocol for communication between
embedded web music applications and their hosts.

## Repository map

- packages/protocol — wire types, schemas, validation and shared protocol logic
- packages/client — SDK used by embedded applications
- packages/host — SDK used by embedding hosts
- packages/conformance — conformance fixtures and browser runner
- packages/adapter-noodlr — legacy Noodlr compatibility only
- examples — minimal integration examples
- tests — cross-package/integration tests
- spec — normative protocol material
- docs — supporting documentation

## Working rules

Keep changes as small and local as possible.

Start by inspecting only the package directly relevant to the task and its
tests. Expand scope only when imports or behaviour require it.

Do NOT read package-lock.json unless changing dependencies.

Do NOT read the full product-spec documents unless the task involves protocol
design, compatibility, security, capabilities or intended standard behaviour.

For ordinary implementation work, treat existing source, types, tests and
README as sufficient context.

Use targeted tests while developing. Run the broader repository checks only
when the change is complete.

Preserve backwards compatibility unless the task explicitly changes the
protocol.

Do not redesign adjacent APIs while fixing an unrelated issue.

Do not browse external sources unless the task requires current information
about another standard or implementation.