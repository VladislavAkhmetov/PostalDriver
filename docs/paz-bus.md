# White and blue PAZ

The supplied `pazik.glb` is prepared as `src/assets/cars/paz.glb` by
`scripts/models/prep-paz.mjs`. The supplied original is not modified.

- 7 m long, +Z forward, Y up, four wheel pivots with 0.46 m rolling radius.
- Around 24.1k triangles; one 1024 px body atlas, one shared 1024 x 512 wheel atlas, and small repair textures.
- White and blue paint and burgundy curtains retained.
- The embedded wheels are removed and replaced with the supplied `pazik_wheel_front.glb` and `pazik_wheel_back.glb` models. Front tyres retain their natural proportions (about 0.291 m wide); the approved rear assemblies remain 0.50 m wide. Both use the same radius, matte rubber and neutral grey steel palette.
- The front source's axle is tilted about 29 degrees. `wheel-axis.mjs` fits its principal axis and straightens the mesh before uniform scaling; no separate compression of the front tyre depth is applied. Its prepared axle points along local X and the tyre stands upright.
- Wheel geometry is simplified independently of the source UV seams, then receives baked sidewall/disc/tread/rim charts. Left/right wheels reuse their prepared mesh and shared material; the outer six-bolt faces point outward. Sources are unchanged.
- Front grille, hatch and headlamp lenses cleaned. Black panels join each front headlight and indicator pair. Rear black panels contain amber/red/white lenses; red bumper reflectors and the rear plate mount follow the reference. Brake glow is positioned on the red lenses and headlamp glow follows the physical lens surface.
- The card `КЛЮЧЕВСК-УФА` is baked into the GLB at the lower viewer-left windscreen.
- Opaque baked glazing is retained; this is an exterior traffic asset.

`loadCars()` loads the prepared PAZ. `buildVehicle('paz', ...)` builds this model,
including animated wheels, independent brake lights, shared night headlamps,
1998 fleet registration plates and existing headlight beams. The other bus kind
remains `liaz` with its current colour variants.

Review: `paz-preview.html` (also a Vite build entry). The standalone version is
created with `node scripts/models/build-paz-preview.mjs` in `reports/paz/preview.html`.
Both previews have front/rear wheel close-ups and a wheel rotation toggle.
`node scripts/models/render-paz.mjs` creates CPU geometry review images; add
`--rolling` to inspect the wheels after a quarter turn. These images show the
prepared asset, not a screenshot of live traffic.

Checks: `node scripts/tests/paz-model.mjs` and `npm run build`.

Rebuild with `node scripts/models/prep-paz.mjs <bus.glb> <output.glb> [front-wheel.glb] [rear-wheel.glb]`.
When wheel arguments are omitted, the two wheel sources are found beside the bus source.
