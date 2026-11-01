import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'dist');
const required = ['index.html', 'styles.css', 'js'];
const optional = ['favicon.svg', '.nojekyll'];

// Validate inputs before replacing a previously successful build.
await Promise.all(required.map((asset) => stat(path.join(root, asset))));
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

for (const asset of required) {
  await cp(path.join(root, asset), path.join(destination, asset), { recursive: true });
}

for (const asset of optional) {
  try {
    await cp(path.join(root, asset), path.join(destination, asset));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

console.log('Static site built in dist/. No runtime dependencies.');
