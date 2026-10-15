import { generateWorld } from './terrain.js';

self.onmessage = ({ data: settings }) => {
  try {
    const world = generateWorld(settings, (progress) => self.postMessage({ progress }));

    self.postMessage(world, [
      world.data,
      world.height.buffer,
      world.water.buffer,
      world.surfaceMap.buffer,
    ]);
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
