import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import { flushEffects } from '../../octane/tests/_helpers';
import { ThemedApp } from './_fixtures/app.tsrx';
import { renderAppToString, runInlineScript } from './_server';

const root = document.documentElement;
let systemDark = false;

function settle(): void {
	for (let pass = 0; pass < 3; pass++) flushEffects();
}

beforeEach(() => {
	systemDark = false;
	window.matchMedia = ((media: string) => ({
		matches: systemDark,
		media,
		addListener() {},
		removeListener() {},
	})) as unknown as typeof window.matchMedia;
	localStorage.clear();
	root.removeAttribute('data-theme');
	root.removeAttribute('class');
	root.style.colorScheme = '';
});

afterEach(() => {
	document.body.replaceChildren();
});

describe('@octanejs/next-themes server rendering and hydration', () => {
	it('serves the inline script with its nonce and scriptProps, and no theme', () => {
		localStorage.setItem('theme', 'dark');
		const html = renderAppToString({
			nonce: 'n0nce',
			scriptProps: { id: 'theme-script', 'data-cfasync': 'false' },
		});
		const template = document.createElement('template');
		template.innerHTML = html;
		const scripts = template.content.querySelectorAll('script');

		expect(scripts).toHaveLength(1);
		expect(scripts[0].getAttribute('nonce')).toBe('n0nce');
		expect(scripts[0].id).toBe('theme-script');
		expect(scripts[0].getAttribute('data-cfasync')).toBe('false');
		// The server cannot read storage, so the guarded text is the placeholder.
		expect(template.content.querySelector('button')?.textContent).toBe('loading');
	});

	it('applies the stored theme before hydration, then hydrates over the server markup', () => {
		localStorage.setItem('theme', 'dark');
		const props = { attribute: 'class' as const, nonce: 'n0nce' };
		const container = document.createElement('div');
		container.innerHTML = renderAppToString(props);
		document.body.appendChild(container);
		const serverScript = container.querySelector('script') as HTMLScriptElement;
		const serverButton = container.querySelector('button') as HTMLButtonElement;

		runInlineScript(serverScript);
		expect(root.className).toBe('dark');
		expect(root.style.colorScheme).toBe('dark');

		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const app = hydrateRoot(container, ThemedApp, props);
		try {
			settle();
			expect(errors).not.toHaveBeenCalled();
			expect(warnings).not.toHaveBeenCalled();
			expect(container.querySelector('script')).toBe(serverScript);
			expect(serverScript.getAttribute('nonce')).toBe('n0nce');
			expect(container.querySelector('button')).toBe(serverButton);
			expect(serverButton.textContent).toBe('dark');
			expect(root.className).toBe('dark');

			flushSync(() => serverButton.click());
			settle();
			expect(serverButton.textContent).toBe('light');
			expect(root.className).toBe('light');
			expect(root.style.colorScheme).toBe('light');
			expect(localStorage.getItem('theme')).toBe('light');
		} finally {
			app.unmount();
			errors.mockRestore();
			warnings.mockRestore();
		}
	});

	it('resolves the system preference in the inline script when nothing is stored', () => {
		systemDark = true;
		const container = document.createElement('div');
		container.innerHTML = renderAppToString({});
		document.body.appendChild(container);

		runInlineScript(container.querySelector('script') as HTMLScriptElement);
		expect(root.getAttribute('data-theme')).toBe('dark');

		const app = hydrateRoot(container, ThemedApp, {});
		try {
			settle();
			expect(container.querySelector('button')?.textContent).toBe('system');
			expect(root.getAttribute('data-theme')).toBe('dark');
			expect(localStorage.getItem('theme')).toBeNull();
		} finally {
			app.unmount();
		}
	});
});
