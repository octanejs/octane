// Best documented configuration for this journey: a client-rendered app,
// hover preload on every link, loads that never read the URL's search (so
// SvelteKit's dependency tracking skips them on a search change), and an
// invalidate keyed to the renamed task.
import '../../../shared/api.js';
import '../../../shared/probe.js';

export const ssr = false;
