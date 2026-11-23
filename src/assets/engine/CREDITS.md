# Звук двигателя и клаксона / Engine & Horn recordings

Professional studio Foley recordings and authentic horn sample, seamless-looped and normalised for this game:

- `engine_studio_idle.wav` — Authentic studio 4-cylinder carburetted SUV engine recording (4.8s seamless loop, HPF 170 Hz). Recorded in the **exact same professional Foley session** with the same studio microphones and acoustics as `starter.wav`. Clean mechanical valve/chuff transients without low-end drone.
- `engine_studio_cruise.wav` — Cruise/drive recording from the same studio Foley session (7.2s seamless loop, HPF 125 Hz).
- `starter.wav` — Authentic Soviet 4x4 struggle starter recording (3.90s): heavy initial compression strokes ("вжык-вжык-вжык"), fuel catch, throttle blip into idle. Cross-fades seamlessly into `engine_studio_idle.wav` at 3.4s.
- `starter_quick.wav` — Reserve faster UAZ start (1.65s).
- `horn.mp3` — Authentic vintage Soviet-style electromagnetic diaphragm horn recording (C302/C56 style dense vibrating "БИ-И-ИП"). The take is silent until 0.26 s; playback starts there, and a held horn loops the sustain from 0.34 s to 1.65 s.
- (Legacy reference loops `engine_low.wav`, `engine_mid.wav`, `engine_hi1.wav`, `engine_hi2.wav` and UAZ cabin files kept intact for comparison).

Processing in `EngineSamples.ts`:
- High-Pass Filter @ 170 Hz (Q = 0.7) eliminates boomy head-pressure and low drone entirely.
- Dynamic Low-Pass Filter (2400 Hz nominal, opening up to ~3000 Hz under throttle/load).
- 3.4s cross-fade timing matching the fuel catch in the starter recording.
- Organic carburetor idle hunting wobble (±0.8%).
- Procedural AudioWorklet disconnected when samples load to eliminate synthetic hiss and 1750 Hz whistle.
