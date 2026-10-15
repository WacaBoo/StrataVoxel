# StrataVoxel

An interactive procedural voxel world generator. Shape mountains, explore blended biomes, and uncover caves—all in your browser.

### [▶ Launch StrataVoxel](https://wacaboo.github.io/StrataVoxel/)

## Explore

- Generate repeatable worlds from a seed, up to **1,280 × 1,280** voxels.
- Blend forests, grasslands, dry terrain, and snowy highlands, or choose a single landscape.
- Adjust elevation, world thickness, water level, and terrain dynamics.
- Orbit the map, enter a surface view, or reveal caves with a geological cutaway.

## Controls

| Action               | Control                              |
| -------------------- | ------------------------------------ |
| Orbit / look         | Drag                                 |
| Zoom                 | Scroll or `+` / `−`                  |
| Pan                  | `Shift` + drag                       |
| Enter surface view   | **Explore surface**, then click land |
| Move in surface view | `WASD`; `Q` / `E` for height         |
| Return to overview   | `Esc`                                |

## Run locally

Requires Node.js 22 or later. No packages or build step.

```sh
node server.cjs
```

Open [localhost:4173](http://127.0.0.1:4173/).

<details>
<summary><strong>How it works</strong></summary>

Plain JavaScript and WebGL, with generation in a cancellable Web Worker. Greedy meshing combines exposed faces into compact geometry, rendered in one draw call. Noise fields shape the land and climate; a drainage graph routes shallow streams downhill.

`app.js` handles rendering and interaction, `camera.js` provides camera math, and `terrain.js` generates and meshes the world. `terrain-worker.js` transfers the generated buffers back to the browser.

**Height** adds base thickness. **Elevation** controls hills and mountains. **World dynamics** adjusts region size and roughness.

This is a finite terrain showcase with a free camera. Water is stepped, and movement has no physics or tree collision. There is no chunk streaming or erosion simulation.

Run `npm test` to check generation and camera math, or `npm run test:large` to include the largest world. GitHub Actions runs verification before publishing the site.

</details>
