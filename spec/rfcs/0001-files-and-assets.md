# RFC 0001: optional files and durable assets

Status: unimplemented draft; no runtime grants or conformance badges.

The product spec defines quotas, ownership, one outstanding chunk, digest checks,
user-owned chooser/confirmation and atomic completion. A future transfer module
must specify how cancellation identifies a transfer across completed requests,
how binary fixtures encode transferable ArrayBuffers, and how partial transfers
expire. These details are not supplied by generic JSON session dispatch.

Before granting files, test 16 MiB per file, 64 MiB aggregate, two concurrent
transfers, 256 KiB chunks, exact counts/SHA-256, backpressure, traversal rejection,
partial/cancel/disconnect cleanup and actual user gesture requirements.

Assets additionally require project authorization, durable IDs, source retention,
copy/share/remap, digest verification, GC and offline behavior. Do not convert
blob URLs or expiring signed URLs into claims of portability. Use experimental
x.org.audiframe grants until the durable profile is specified and independently tested.
