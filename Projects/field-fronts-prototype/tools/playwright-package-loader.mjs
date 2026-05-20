import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'playwright') {
    return {
      url: pathToFileURL(resolvePath(process.cwd(), '..', '..', 'node_modules', 'playwright', 'index.mjs')).href,
      shortCircuit: true
    };
  }

  return nextResolve(specifier, context);
}
