// Contract-marked but unreadable as a contract: the marker is present yet the
// call argument is not a statically-known literal tree.
import { defineThemeTokens } from 'octane/theme-tokens';

declare const buildTokens: () => { colors: { primary: string } };

export const tokens = defineThemeTokens(buildTokens());
