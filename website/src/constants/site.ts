// Site-wide constants with more than one consumer. Presentation (icon assets,
// scoped CSS) stays in the components; only the shared *values* live here, so a
// URL or timing can't drift between two files that are meant to agree.
//
// Static files (index.html, public/*.xml|json|txt) can't import this module —
// tests/seo.test.ts checks them against these values instead.

// Project social links, shared by the header bar and the footer strip.
export const SOCIAL = {
	x: 'https://x.com/octanejs',
	discord: 'https://discord.gg/8puY9fFqd9',
	github: 'https://github.com/octanejs/octane',
} as const;

// How long a copy button shows "Copied" before reverting to "Copy".
export const COPY_RESET_MS = 1500;

// The default document title. Must stay byte-identical to the <title> in
// index.html so restoring it after a page unmount can't flicker a different
// value; seo.test.ts asserts the two match.
export const SITE_TITLE = "Octane — React's programming model, compiled";
