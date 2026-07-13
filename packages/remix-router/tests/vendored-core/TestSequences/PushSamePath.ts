// Ported from react-router@8.2.0 packages/react-router/__tests__/router/TestSequences/PushSamePath.ts — verbatim except: history import re-pointed at the vendored source (expect/assertions come from the vitest globals shim loaded by the importing test).
import type { History } from '../../../src/lib/router/history';

export default async function PushSamePath(history: History) {
	expect(history.location).toMatchObject({
		pathname: '/',
	});

	history.push('/home');
	expect(history.action).toBe('PUSH');
	expect(history.location).toMatchObject({
		pathname: '/home',
	});

	history.push('/home');
	expect(history.action).toBe('PUSH');
	expect(history.location).toMatchObject({
		pathname: '/home',
	});

	// JSDom doesn't fire the listener synchronously :(
	let promise = new Promise((resolve) => {
		let unlisten = history.listen(() => {
			unlisten();
			resolve(null);
		});
	});
	history.go(-1);
	await promise;
	expect(history.action).toBe('POP');
	expect(history.location).toMatchObject({
		pathname: '/home',
	});
}
