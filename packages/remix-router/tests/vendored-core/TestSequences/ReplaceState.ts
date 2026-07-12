// Ported from react-router@7.18.1 packages/react-router/__tests__/router/TestSequences/ReplaceState.ts — verbatim except: history import re-pointed at the vendored source (expect/assertions come from the vitest globals shim loaded by the importing test).
import type { History } from '../../../src/lib/router/history';

export default function ReplaceState(history: History) {
	expect(history.location).toMatchObject({
		pathname: '/',
	});

	history.replace('/home?the=query#the-hash', { the: 'state' });
	expect(history.action).toBe('REPLACE');
	expect(history.location).toMatchObject({
		pathname: '/home',
		search: '?the=query',
		hash: '#the-hash',
		state: { the: 'state' },
	});
}
