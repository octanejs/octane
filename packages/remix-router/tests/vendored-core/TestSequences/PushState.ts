// Ported from react-router@8.2.0 packages/react-router/__tests__/router/TestSequences/PushState.ts — verbatim except: history import re-pointed at the vendored source (expect/assertions come from the vitest globals shim loaded by the importing test).
import type { History } from '../../../src/lib/router/history';

export default function PushState(history: History) {
	expect(history.location).toMatchObject({
		pathname: '/',
	});

	history.push('/home?the=query#the-hash', { the: 'state' });
	expect(history.action).toBe('PUSH');
	expect(history.location).toMatchObject({
		pathname: '/home',
		search: '?the=query',
		hash: '#the-hash',
		state: { the: 'state' },
	});
}
