import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { ForeignHookNames } from './_fixtures/foreign-hook-names.tsx';

// A hook imported from another module may shadow an octane builtin's name
// (React-parity bindings export `useId`, `useState`-alikes, …). The import
// binding wins: the compiled call site must invoke the imported function, not
// octane's builtin — and must not inject a colliding octane runtime import.
describe('hooks imported from other modules shadowing builtin names', () => {
	it('calls the imported hook, not the octane builtin', () => {
		const r = mount(ForeignHookNames);
		const el = r.container.querySelector('div')!;
		expect(el.id).toBe('foreign-x');
		expect(el.textContent).toBe('foreign-a:foreign-b:foreign-c');
		r.unmount();
	});
});
