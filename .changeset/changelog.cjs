// Retrying wrapper around `@changesets/changelog-github`.
//
// The GitHub changelog plugin makes a single GraphQL request to api.github.com
// to turn commits/PRs into changelog links. That request is occasionally
// truncated mid-stream ("Premature close" / "Failed to parse data from GitHub"),
// and the plugin has no retry, so one transient network blip fails the entire
// Release workflow. `@changesets/get-github-info` uses DataLoader, which evicts
// failed keys from its cache, so simply re-calling the function re-fetches
// cleanly. This wraps both changelog functions with a bounded retry+backoff.

const github = require('@changesets/changelog-github');

const changelogFunctions = github.default ?? github;

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1000;

// Transient failures from the GitHub GraphQL fetch. Anything else (bad token,
// GraphQL errors, missing data) is a real config problem and is rethrown.
const TRANSIENT_PATTERNS = [
	'Premature close',
	'Failed to parse data from GitHub',
	'An error occurred when fetching data from GitHub',
	'ECONNRESET',
	'ETIMEDOUT',
	'EAI_AGAIN',
	'socket hang up',
	'network',
];

function isTransient(error) {
	const message = String(error?.message ?? error);
	return TRANSIENT_PATTERNS.some((pattern) => message.includes(pattern));
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function withRetry(fn) {
	return async (...args) => {
		let lastError;
		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			try {
				return await fn(...args);
			} catch (error) {
				lastError = error;
				if (attempt === MAX_ATTEMPTS || !isTransient(error)) throw error;
				const delay = BASE_DELAY_MS * attempt;
				console.warn(
					`[changeset changelog] transient GitHub error (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${delay}ms: ${error.message}`,
				);
				await sleep(delay);
			}
		}
		throw lastError;
	};
}

module.exports = {
	getReleaseLine: withRetry(changelogFunctions.getReleaseLine),
	getDependencyReleaseLine: withRetry(changelogFunctions.getDependencyReleaseLine),
};
