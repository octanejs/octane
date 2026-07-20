import assert from 'node:assert/strict';
import { runWithHostRuntimeEnv } from '../src/server/runtime/host.server';
import { getGitHubContentFetchOptions } from '../src/utils/documents.server';

function getHeaderValue(init: RequestInit, name: string) {
	return new Headers(init.headers).get(name);
}

const authenticatedOptions = runWithHostRuntimeEnv({ GITHUB_AUTH_TOKEN: 'host-token' }, () =>
	getGitHubContentFetchOptions(),
);

assert.equal(
	getHeaderValue(authenticatedOptions, 'Authorization'),
	'Bearer host-token',
	'GitHub API fetches use the Worker env token when present',
);
assert.equal(
	getHeaderValue(authenticatedOptions, 'User-Agent'),
	'TanStack-Docs',
	'GitHub API fetches include the required default User-Agent',
);

const unauthenticatedOptions = runWithHostRuntimeEnv({ GITHUB_AUTH_TOKEN: 'host-token' }, () =>
	getGitHubContentFetchOptions({ includeAuthorization: false }),
);

assert.equal(
	getHeaderValue(unauthenticatedOptions, 'Authorization'),
	null,
	'GitHub API fetches can still opt out of authorization',
);
assert.equal(
	getHeaderValue(getGitHubContentFetchOptions({ userAgent: 'docs:tanstack/table' }), 'User-Agent'),
	'docs:tanstack/table',
	'GitHub API fetches can override the default User-Agent',
);

console.log('github-content-fetch-options tests passed');
