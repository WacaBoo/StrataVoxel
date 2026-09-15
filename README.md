# StrataVoxel · Procedural world lab

A compact, dependency-free browser prototype for a procedural generation portfolio. Seeded voxel islands, mountains, blended biomes, downhill streams, trees, and underground tunnels. Three landscape presets plus a mixed-biome world, independent terrain controls, a geological cutaway, and a surface camera.

## Preview

Run `node server.cjs`, then visit http://127.0.0.1:4173. Use an HTTP server; browser workers and ES modules do not reliably run from a double-clicked file.

## GitHub Pages

Commit this folder to a GitHub repository. In **Settings → Pages**, choose **Deploy from a branch**, then your branch and **/(root)**. All asset paths are relative, so project Pages subpaths work. No build, API keys, or backend is needed. This prototype has not been published automatically.

## Controls

- Drag / touch-drag to orbit; scroll to zoom up to 128×. Shift-drag to pan around the map.
- Focus the world and use arrow keys to rotate, `+` / `-` to zoom.
- Change sliders or presets to regenerate; edit the seed and press Generate World.
- Enable Geological cutaway to expose the tunnel network.
- Mixed-biome world disables the single-landscape selector. Seeded temperature and moisture fields blend rolling grassland, forest, dry terrain, and snowy highlands. Turn it off to use a single preset again.
- World sizes range from **96 × 96** to **1,280 × 1,280**. The default is 384 × 384. Large generations can be cancelled, retaining the previous world.
- **Elevation** controls hills and mountain relief; zero produces low, gently varying terrain. **Height** adds base thickness without changing the surface shape, biome distribution, or relative water levels. Water level is measured above that base.
- **World dynamics** controls region size and terrain roughness: low values produce broad, gradual transitions; high values produce smaller regions and rougher landforms. The default is 35%.
- The compass projects world-space north (−Z), east (+X), south (+Z), west (−X), and up (+Y) using the same camera basis as the terrain. Tilt and rotation are reflected in the compass; the numeric heading measures the horizontal viewing direction clockwise from north. Dashed axes point away from the camera.
- Click **Explore surface**, then click land to enter a perspective camera above that voxel. Drag or use arrows to look; WASD moves, Q/E changes height, Shift accelerates, and Escape returns to overview. Forward/Back buttons and scrolling also move the camera. This is a free camera with a terrain-height floor, not a physics controller; it can pass through trees and cannot descend into caves.

## Implementation and scope

Plain WebGL with one static vertex buffer and one draw call. Greedy meshing merges coplanar exposed faces with matching material and lighting. Positions use signed 16-bit integers and colors use normalized bytes: 12 bytes per vertex. Climate colors use 64 blends plus 16 rock/snow shades so nearby surfaces can still merge. Terrain retains full voxel resolution at every world size. Vertical storage adapts to the generated height rather than clipping at a fixed ceiling.

Generation and meshing run in a cancellable Web Worker, using transferable buffers. Cave cross-sections are calculated once per column. Rendering occurs on demand, with continuous frames only during automatic orbit or keyboard movement. Pixel ratio is capped at 1.5. Visible statistics report worker generation/meshing time, merged quads, occupied voxels, and GPU vertex payload size. Generation time excludes upload and rendering.

Observed in the local Node verification run: the 1,280 × 1,280 mixed world at seed STRATA-0042, elevation 55, height 24, dynamics 35, water 13, caves on generated in about 3.3 seconds, with 66.7 million occupied voxels and a 13.8 MiB mesh. These are local observations, not browser frame-rate guarantees. Temporary worker memory is higher than mesh size; the largest setting is best suited to desktop devices.

This is a finite voxel prototype, not an infinite-world engine or a benchmark claiming optimal performance. Layered value noise controls continental landforms, broad mountain regions, climate, and irregular cave paths. A coarse priority-flood drainage graph resolves depressions and accumulates upstream area to select streams. Shallow channels follow that drainage with sloped banks; water uses stepped voxel surfaces. This is not a fluid or erosion simulation. There is no fixed sine-wave river running through the world.

Terrain regenerates as a whole. There is no physics, chunk streaming, LOD, or dynamic lighting. The next performance step is spatial chunks and camera-based culling, guided by device measurements. Generator changes in this version change the output of older seeds; identical settings remain deterministic within this version.

## Verification

Run `node verify.cjs` for deterministic generation, seed variation, presets, cave carving, cutaway, input bounds, independent thickness, elevation/dynamics effects on slopes, and compass orientation. `node verify.cjs --large` also generates the full 1,280-square world and validates packed position bounds, mesh size, and climate variety.
