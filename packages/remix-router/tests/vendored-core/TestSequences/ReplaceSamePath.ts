// Ported from react-router@8.2.0 packages/react-router/__tests__/router/TestSequences/ReplaceSamePath.ts — verbatim except: history import re-pointed at the vendored source (expect/assertions come from the vitest globals shim loaded by the importing test).
import type { History } from '../../../src/lib/router/history';

export default function ReplaceSamePath(history: History) {
	expect(history.location).toMatchObject({
		pathname: '/',
	});

	history.replace('/home');
	expect(history.action).toBe('REPLACE');
	expect(history.location).toMatchObject({
		pathname: '/home',
	});

	let prevLocation = history.location;

	history.replace('/home');
	expect(history.action).toBe('REPLACE');
	expect(history.location).toMatchObject({
		pathname: '/home',
	});

	expect(history.location).not.toBe(prevLocation);
}
