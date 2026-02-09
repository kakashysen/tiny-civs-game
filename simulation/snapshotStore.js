import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * @param {string} rootDir
 * @param {import('../shared/types.js').WorldState} world
 */
export async function writeSnapshot(rootDir, world) {
  await mkdir(rootDir, { recursive: true });
  const filename = `${world.runId}-tick-${String(world.tick).padStart(5, '0')}.json`;
  const target = join(rootDir, filename);
  await writeFile(target, JSON.stringify(world, null, 2), 'utf-8');
  return target;
}
