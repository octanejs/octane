// Token-contract fixture: a real `defineThemeTokens` module the synchronous
// resolver reads from disk, mirroring how an app declares its contract.
import { defineThemeTokens } from 'octane/theme-tokens';

export const tokens = defineThemeTokens(
	{
		colors: {
			primary: '#3b82f6',
			surface: '#ffffff',
		},
		space: {
			sm: '0.25rem',
			md: '0.5rem',
		},
	},
	{ prefix: 'app' },
);
