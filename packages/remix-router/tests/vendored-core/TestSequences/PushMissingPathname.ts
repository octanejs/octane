// Ported from react-router@7.18.1 packages/react-router/__tests__/router/TestSequences/PushMissingPathname.ts — verbatim except: history import re-pointed at the vendored source (expect/assertions come from the vitest globals shim loaded by the importing test).
import type { History } from '../../../src/lib/router/history';

export default function PushMissingPathname(history: History) {
	expect(history.location).toMatchObject({
		pathname: '/',
	});

	history.push('/home?the=query#the-hash');
	expect(history.action).toBe('PUSH');
	expect(history.location).toMatchObject({
		pathname: '/home',
		search: '?the=query',
		hash: '#the-hash',
	});

	history.push('?another=query#another-hash');
	expect(history.action).toBe('PUSH');
	expect(history.location).toMatchObject({
		pathname: '/home',
		search: '?another=query',
		hash: '#another-hash',
	});
}
