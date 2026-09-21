// Two contracts in one module — the resolver reports both namespaces.
import { defineThemeTokens } from 'octane/theme-tokens';

export const appTokens = defineThemeTokens({ colors: { fg: '#111' } }, { prefix: 'app' });
export const adminTokens = defineThemeTokens({ colors: { bg: '#000' } }, { prefix: 'admin' });
