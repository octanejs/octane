import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Vitest loads built-in environments from the invoking CLI's peer graph. Resolve
// from the binding so root and package-local runs both use upstream's jsdom pin.
const require = createRequire(new URL('../../packages/base-ui/package.json', import.meta.url));
const { builtinEnvironments } = await import(pathToFileURL(require.resolve('vitest/runtime')).href);

export default builtinEnvironments.jsdom;
