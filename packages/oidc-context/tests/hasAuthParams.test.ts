// Per packages/oidc-context/upstream/canonical/test/utils.test.tsx
import { describe, expect, it } from 'vitest';
import { hasAuthParams } from '../src/utils';
import { createLocation } from './helpers';

describe('utils hasAuthParams', function () {
	it.each([
		['?code=1', ''],
		['?foo=1&code=2', ''],
		['?code=1&foo=2', ''],
		['', '#code=1&foo=2'],
		['', '#foo=1&code=2'],
		['', '#code=1&foo=2'],
	])(
		"should not recognize only the code param in location { search: '%s', hash: '%s' }",
		function (search, hash) {
			const location = createLocation(search, hash);
			const result = hasAuthParams(location);
			expect(result).toBeFalsy();
		},
	);

	it.each([
		['?code=1&state=2', ''],
		['?foo=1&state=2&code=3', ''],
		['?code=1&foo=2&state=3', ''],
		['?state=1&code=2&foo=3', ''],
		['', '#code=1&state=2'],
		['', '#foo=1&state=2&code=3'],
		['', '#code=1&foo=2&state=3'],
		['', '#state=1&code=2&foo=3'],
	])(
		"should recognize the code and state param in location { search: '%s', hash: '%s' }",
		function (search, hash) {
			const location = createLocation(search, hash);
			const result = hasAuthParams(location);
			expect(result).toBeTruthy();
		},
	);

	it.each([
		['?error=1&state=2', ''],
		['?foo=1&state=2&error=3', ''],
		['?error=1&foo=2&state=3', ''],
		['?state=1&error=2&foo=3', ''],
		['', '#error=1&state=2'],
		['', '#foo=1&state=2&error=3'],
		['', '#error=1&foo=2&state=3'],
		['', '#state=1&error=2&foo=3'],
	])(
		"should recognize the error and state param in location { search: '%s', hash: '%s' }",
		function (search, hash) {
			const location = createLocation(search, hash);
			const result = hasAuthParams(location);
			expect(result).toBeTruthy();
		},
	);

	it.each([
		['?error=1', ''],
		['?foo=1&error=2', ''],
		['?error=1&foo=2', ''],
		['', '#error=1'],
		['', '#foo=1&error=2'],
		['', '#error=1&foo=2'],
	])(
		"should ignore the error param without state param in location { search: '%s', hash: '%s' }",
		function (search, hash) {
			const location = createLocation(search, hash);
			const result = hasAuthParams(location);
			expect(result).toBeFalsy();
		},
	);

	it.each([
		['', ''],
		['?', ''],
		['?foo=1', ''],
		['?code=&foo=2', ''],
		['?error=', ''],
		['', '#'],
		['', '#foo=1'],
		['', '#code=&foo=2'],
		['', '#error='],
	])(
		"should ignore invalid params in location { search: '%s', hash: '%s' }",
		function (search, hash) {
			const location = createLocation(search, hash);
			const result = hasAuthParams(location);
			expect(result).toBeFalsy();
		},
	);
});
