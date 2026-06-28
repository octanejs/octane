import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { FocusEvents } from './_fixtures/focus-events.tsrx';

describe('focus/blur delegation (capture phase)', () => {
	it('fires onFocus on the target AND its ancestor, then onBlur', () => {
		const r = mount(FocusEvents);
		const inp = r.container.querySelector('.inp') as HTMLInputElement;
		inp.focus();
		// target onFocus ('f') + ancestor onFocus ('W') both fire (order: target up).
		expect(r.container.querySelector('.log')!.textContent).toBe('fW');
		inp.blur();
		expect(r.container.querySelector('.log')!.textContent).toBe('fWb');
		r.unmount();
	});
});
