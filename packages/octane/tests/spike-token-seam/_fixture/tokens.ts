/**
 * U1 spike fixture — a typed token contract module, authored in plain `.ts`
 * exactly as KTD1 requires ("token contract is a plain `.ts` declaration
 * module fed to compile() by a host-facts callback").
 *
 * The declaration uses the U4 helper shape (`octane/theme-tokens`, a
 * `defineVars`-shaped nested object) so the compile-path reader extracts the
 * same facts the typecheck gate checks: prefix `app` + leaf paths gives the
 * custom-property names `--app-colors-primary`, `--app-colors-surface`,
 * `--app-space-sm`, `--app-space-md`.
 */
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
