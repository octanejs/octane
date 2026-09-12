import { expect, it } from 'vitest';
import * as Binding from '@octanejs/tanstack-db';
import * as Core from '@tanstack/db';
import * as ReactBinding from '@tanstack/react-db';

it('preserves every neutral core export by identity', () => {
	for (const [name, value] of Object.entries(Core)) {
		expect(Binding[name as keyof typeof Binding], name).toBe(value);
	}
});

it('exposes exactly the pinned React adapter value exports', () => {
	expect(Object.keys(Binding).sort()).toEqual(Object.keys(ReactBinding).sort());
});
