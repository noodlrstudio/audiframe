# Examples

- `minimal-host`: vanilla JavaScript, independent of Noodlr, port 4100.
- `minimal-app`: stateful instrument on port 4101; gated recall, virtual notes,
  atomic parameter validation, audio activation inside the app.
- `stateful-synth`: shares the minimal instrument's real state/audio implementation.
- `sequencer`: local channel-10 MIDI sequence; does not claim transport-follow conformance.
- `denied-capability`: denied file access and resize; the instrument stays usable.
- `pulse`: real upstream Pulse integration instructions and independent host.
- `adversarial-app`: independent wire implementation for bootstrap failure/abuse fixtures.

Change the minimal host iframe URL to try another app on port 4101. Focus and
external-open actions belong to the host. Unsupported schema/restore failure,
revocation and navigation recovery are exercised by the browser conformance
runner rather than permanent debug text in the musical UI. Binary file transfer
is not implemented; denied-file handling is the only file example in this draft.
