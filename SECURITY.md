# Security

This is pre-release software. Do not grant unimplemented profiles or expose
sensitive state to origins that have not been approved by the user/project.
Report vulnerabilities privately through the repository's GitHub security
advisory workflow. Avoid snapshots, filenames, MIDI contents or credentials
in public issue reports. No central telemetry exists.

Authenticate exact iframe/parent source, HTTPS origin (localhost development
exception), nonce and one transferred port before any session data. Reject
opaque origins. MessagePorts are bearer capabilities. Session IDs and strictly
increasing sequence numbers reject stale packets. Validate every envelope,
grant, direction, port, JSON size/depth and negotiated quota. Close abusive
sessions, reject pending requests and cancel queued work on disconnect/revocation.

Host storage must bind state to approved app ID **and origin**, retain the last
validated snapshot and gate publication while restoring. App state setters must
validate/migrate detached state before mutation. Cancellation is best effort and
cannot promise rollback after application.

Untrusted apps use a separate origin. Restrict CSP frame-src, iframe sandbox and
Permissions Policy independently. Never bypass frame-ancestors/X-Frame-Options.
Do not render manifest strings as HTML or use filenames as paths. Cooperative
mute cannot silence a malicious app; the host can remove the iframe.

Open review gates: independent security review, third-party SDK interoperability,
file transfers, parser differential/fuzz coverage, background timing distributions,
physical Safari/iOS and hardware MIDI. See docs/validation.md for measured scope.
