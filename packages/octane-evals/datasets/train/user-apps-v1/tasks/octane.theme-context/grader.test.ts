import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import { App, ThemeLabel } from '@octane-eval-submission/octane.theme-context/src/App.tsrx';

afterEach(cleanup);

describe('octane.theme-context', () => {
	it('uses the context default when no provider is present', () => {
		const view = render(ThemeLabel, { props: { id: 'standalone-theme' } });
		const label = view.container.querySelector('#standalone-theme')!;

		expect(label.textContent).toBe('system');
		expect(label.getAttribute('data-theme')).toBe('system');
		expect(label.classList.contains('theme-label')).toBe(true);
		expect(label.classList.contains('theme-system')).toBe(true);
	});

	it('updates outer consumers without changing the nested override', () => {
		const view = render(App);
		const settings = view.container.querySelector('#settings')!;
		const current = view.container.querySelector('#current-theme')!;
		const nested = view.container.querySelector('#nested-preview')!;
		const toggle = view.container.querySelector<HTMLButtonElement>('#toggle-theme')!;

		expect(settings.getAttribute('data-theme')).toBe('light');
		expect(current.textContent).toBe('light');
		expect(current.classList.contains('theme-light')).toBe(true);
		expect(nested.textContent).toBe('sepia');
		expect(nested.classList.contains('theme-sepia')).toBe(true);

		fireEvent.click(toggle);
		expect(settings.getAttribute('data-theme')).toBe('dark');
		expect(current.textContent).toBe('dark');
		expect(current.classList.contains('theme-dark')).toBe(true);
		expect(nested.textContent).toBe('sepia');

		fireEvent.click(toggle);
		expect(settings.getAttribute('data-theme')).toBe('light');
		expect(current.textContent).toBe('light');
		expect(nested.textContent).toBe('sepia');
	});
});
