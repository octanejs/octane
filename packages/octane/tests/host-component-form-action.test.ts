import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, hostComponent } from '../src/index.js';

// `hostComponent` (the primitive behind @octanejs/motion's `motion.<tag>`) applies
// arbitrary host props, so it installs descriptor form actions itself. This file
// must not call a public element factory: any of them installs the same path and
// would hide a missing install.
const containers: HTMLElement[] = [];
afterEach(() => {
	for (const container of containers.splice(0)) container.remove();
});

describe('hostComponent form actions', () => {
	it('intercepts submit for a function action without any element factory', () => {
		const calls: boolean[] = [];
		const Host = (_props: unknown, scope: any): void => {
			hostComponent(
				scope,
				0,
				'form',
				{ action: (data: FormData) => calls.push(data instanceof FormData) },
				null,
			);
		};
		const container = document.createElement('div');
		document.body.append(container);
		containers.push(container);
		const root = createRoot(container);
		root.render(Host as any);
		const form = container.querySelector('form')!;
		expect(form.hasAttribute('action')).toBe(false);
		const event = new Event('submit', { bubbles: true, cancelable: true });
		form.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect(calls).toEqual([true]);
		root.unmount();
	});
});
