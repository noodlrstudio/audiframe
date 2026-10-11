# Real Pulse reference

Upstream: https://github.com/5of12/Pulse/tree/8cbbd401587682a69327a9932739aadb805e0df7

Source baseline is pinned above; audiframe integration is a separate upstream
change. No Pulse source or license is silently copied into this repository.
Credit: **Pulse · Chris Thomaidis**. Run that integrated checkout on port 3000,
then open this host on port 4100. Its manifest ID is `co.uk.5of12.pulse`.

Only lifecycle, state and virtual MIDI profiles are advertised. Standalone Pulse
continues to work. MIDI-only embedding is `?audiframe=1&midiOnly=1`; use channel
10 and release each note. The dual stack chooses one protocol and suppresses
legacy output once audiframe is selected. Parameters, transport follow and file
portability are not claimed. Custom samples/URLs require a future asset profile.
