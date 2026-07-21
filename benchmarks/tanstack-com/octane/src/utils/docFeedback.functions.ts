// Bench delta: upstream (docFeedback.functions.upstream.ts.txt) backs these
// server fns with Postgres via drizzle and GitHub auth. The benchmark has no
// database and no login, so every fn returns exactly what upstream returns to
// a logged-out visitor (reads: empty, no moderation; writes: auth error). The
// docs feedback UI still renders and behaves as it does for anonymous users.
import { createServerFn } from '@octanejs/tanstack-start';

const AUTH_DISABLED_ERROR = 'Authentication is disabled in the benchmark build';

export const createDocFeedback = createServerFn({ method: 'POST' }).handler(async () => {
	throw new Error(AUTH_DISABLED_ERROR);
});

export const updateDocFeedback = createServerFn({ method: 'POST' }).handler(async () => {
	throw new Error(AUTH_DISABLED_ERROR);
});

export const deleteDocFeedback = createServerFn({ method: 'POST' }).handler(async () => {
	throw new Error(AUTH_DISABLED_ERROR);
});

export const updateDocFeedbackCollapsed = createServerFn({
	method: 'POST',
}).handler(async () => {
	throw new Error(AUTH_DISABLED_ERROR);
});

export const getUserDocFeedback = createServerFn({ method: 'POST' }).handler(async () => {
	return { feedback: [], total: 0 };
});

export const listDocFeedbackForModeration = createServerFn({
	method: 'POST',
}).handler(async () => {
	return { feedback: [], total: 0 };
});

export const moderateDocFeedback = createServerFn({ method: 'POST' }).handler(async () => {
	throw new Error(AUTH_DISABLED_ERROR);
});

export const getDocFeedbackLeaderboard = createServerFn({
	method: 'POST',
}).handler(async () => {
	return { entries: [] };
});

export const getDocFeedbackForPage = createServerFn({ method: 'POST' }).handler(async () => {
	return {
		userFeedback: [] as any[],
		detachedFeedback: [] as any[],
		isModerator: false,
	};
});

export const adminGetDocFeedback = createServerFn({ method: 'POST' }).handler(async () => {
	return null;
});

export const markFeedbackDetached = createServerFn({ method: 'POST' }).handler(async () => {
	throw new Error(AUTH_DISABLED_ERROR);
});
