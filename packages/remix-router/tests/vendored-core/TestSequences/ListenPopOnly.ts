// Ported from react-router@8.2.0 packages/react-router/__tests__/router/TestSequences/ListenPopOnly.ts — verbatim except: history import re-pointed at the vendored source (expect/assertions come from the vitest globals shim loaded by the importing test).
import type { History } from '../../../src/lib/router/history';

export default function ListenPopOnly(history: History) {
	let spy = jest.fn();
	let unlisten = history.listen(spy);

	history.push('/2');
	expect(history.location.pathname).toBe('/2');
	history.replace('/3');
	expect(history.location.pathname).toBe('/3');

	expect(spy).not.toHaveBeenCalled();
	unlisten();
}
