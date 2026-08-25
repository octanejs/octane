import { describe, it } from 'vitest';

// @tsrx/react compiles `@for` to a loop body where per-item hooks violate React's
// rules of hooks, so this fixture cannot serve as a byte-parity oracle. Behavioral
// coverage lives in ../for-usememo-remove.test.ts.

describe.skip('differential: for-usememo-remove.tsrx — useMemo in keyed @for', () => {
	it('requires a child-component fixture to compare with React', () => {});
});
