import { describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { ErrorsUpdate, FalsyEntry } from './_fixtures/react-aria-field-error.tsrx';

// FieldError is the one ported family that derives its rendered content inside
// a useMemo instead of straight from props, so it is the one place where
// octane's closure-capture rules can silently freeze what a user sees.
describe('@octanejs/shadcn/react-aria — FieldError', () => {
	it('shows the current errors after the prop changes', () => {
		const r = mount(ErrorsUpdate);
		expect(r.container.textContent).toContain('first');

		r.click('#swap');
		expect(r.container.textContent, 'stale content after the errors prop changed').toContain(
			'second',
		);
		expect(r.container.textContent).not.toContain('first');
		r.unmount();
	});

	it('renders a list once there is more than one error', () => {
		const r = mount(ErrorsUpdate);
		r.click('#two');
		const items = r.container.querySelectorAll('li');
		expect(items).toHaveLength(2);
		expect([...items].map((li) => li.textContent)).toEqual(['a', 'b']);
		r.unmount();
	});

	it('drops entries without a message instead of rendering them', () => {
		const r = mount(FalsyEntry);
		const items = r.container.querySelectorAll('li');
		expect([...items].map((li) => li.textContent)).toEqual(['real', 'also real']);
		// `cond && <li/>` leaves `false` in the children array; it must not reach
		// the DOM as text.
		expect(r.container.textContent).not.toContain('false');
		r.unmount();
	});
});
