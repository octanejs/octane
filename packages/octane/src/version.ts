import pkg from '../package.json' with { type: 'json' };

// Source the version from package.json so it cannot drift from the published
// package version. This module is isolated so importing the main runtime does
// not retain the rest of the manifest when `version` is unused.
export const version: string = pkg.version;
