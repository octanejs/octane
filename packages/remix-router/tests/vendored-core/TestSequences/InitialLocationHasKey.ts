// Ported from react-router@7.18.1 packages/react-router/__tests__/router/TestSequences/InitialLocationHasKey.ts — verbatim except: history import re-pointed at the vendored source (expect/assertions come from the vitest globals shim loaded by the importing test).
import type { History } from '../../../src/lib/router/history';

export default function InitialLocationHasKey(history: History) {
	expect(history.location.key).toBeTruthy();
}
