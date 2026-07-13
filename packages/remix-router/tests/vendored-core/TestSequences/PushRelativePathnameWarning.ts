// Ported from react-router@8.2.0 packages/react-router/__tests__/router/TestSequences/PushRelativePathnameWarning.ts — verbatim except: history import re-pointed at the vendored source (expect/assertions come from the vitest globals shim loaded by the importing test).
import type { History } from '../../../src/lib/router/history';

export default function PushRelativePathnameWarning(history: History) {
	expect(history.location).toMatchObject({
		pathname: '/',
	});

	history.push('/the/path?the=query#the-hash');
	expect(history.action).toBe('PUSH');
	expect(history.location).toMatchObject({
		pathname: '/the/path',
		search: '?the=query',
		hash: '#the-hash',
	});

	let spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
	history.push('../other/path?another=query#another-hash');
	expect(spy).toHaveBeenCalledWith(expect.stringContaining('relative pathnames are not supported'));
	spy.mockReset();

	expect(history.location).toMatchObject({
		pathname: '../other/path',
		search: '?another=query',
		hash: '#another-hash',
	});
}
