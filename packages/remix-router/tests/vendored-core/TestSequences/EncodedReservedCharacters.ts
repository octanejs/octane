// Ported from react-router@7.18.1 packages/react-router/__tests__/router/TestSequences/EncodedReservedCharacters.ts — verbatim except: history import re-pointed at the vendored source (expect/assertions come from the vitest globals shim loaded by the importing test).
import type { History } from '../../../src/lib/router/history';

export default function EncodeReservedCharacters(history: History) {
	let pathname;

	// encoded string
	pathname = '/view/%23abc';
	history.replace(pathname);
	expect(history.location).toMatchObject({
		pathname: '/view/%23abc',
	});

	// encoded object
	pathname = '/view/%23abc';
	history.replace({ pathname });
	expect(history.location).toMatchObject({
		pathname: '/view/%23abc',
	});

	// unencoded string
	pathname = '/view/#abc';
	history.replace(pathname);
	expect(history.location).toMatchObject({
		pathname: '/view/',
		hash: '#abc',
	});
}
