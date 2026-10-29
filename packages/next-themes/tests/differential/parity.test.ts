import { act, createElement, useEffect as useReactEffect } from 'react';
import { createRoot as createReactRoot, type Root as ReactRoot } from 'react-dom/client';
import { renderToString as renderReactToString } from 'react-dom/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, flushSync, type Root } from 'octane';
import { flushEffects } from '../../../octane/tests/_helpers';
import * as Upstream from '../../upstream/src/index.tsx';
import type { ThemeProviderProps, UseThemeProps } from '../../src/index.tsrx';
import { ThemedApp } from '../_fixtures/app.tsrx';
import { renderProviderToString, runInlineScript } from '../_server';

// Every case drives the pinned React next-themes and the Octane port through
// the same steps and compares what a page can observe after each one: the
// <html> theme attributes and color-scheme, localStorage, the transition-
// blocking <style>, and the useTheme() value.

const MEDIA = '(prefers-color-scheme: dark)';
const html = document.documentElement;

type MediaListener = (event: { matches: boolean; media: string }) => void;
const system = { dark: false, listeners: new Set<MediaListener>() };

function setSystemDark(dark: boolean): void {
	system.dark = dark;
	for (const listener of [...system.listeners]) listener({ matches: dark, media: MEDIA });
}

interface Implementation {
	mount(props: ThemeProviderProps): void;
	step(run: () => void): void;
	value(): UseThemeProps;
	unmount(): void;
}

function reactImplementation(): Implementation {
	let latest: UseThemeProps | undefined;
	let root: ReactRoot | undefined;
	const container = document.body.appendChild(document.createElement('div'));
	function Probe() {
		const value = Upstream.useTheme();
		useReactEffect(() => {
			latest = value;
		}, [value]);
		return null;
	}
	return {
		mount(props) {
			root = createReactRoot(container);
			act(() => root!.render(createElement(Upstream.ThemeProvider, props, createElement(Probe))));
		},
		step(run) {
			act(run);
		},
		value: () => latest!,
		unmount() {
			act(() => root!.unmount());
			container.remove();
		},
	};
}

function octaneImplementation(): Implementation {
	let latest: UseThemeProps | undefined;
	let root: Root | undefined;
	const container = document.body.appendChild(document.createElement('div'));
	const settle = () => {
		for (let pass = 0; pass < 3; pass++) flushEffects();
	};
	const onTheme = (value: UseThemeProps) => {
		latest = value;
	};
	return {
		mount(props) {
			root = createRoot(container);
			root.render(ThemedApp, { ...props, onTheme });
			settle();
		},
		step(run) {
			flushSync(run);
			settle();
		},
		value: () => latest!,
		unmount() {
			root!.unmount();
			container.remove();
		},
	};
}

function observe(implementation: Implementation) {
	const { theme, resolvedTheme, systemTheme, forcedTheme, themes } = implementation.value();
	return {
		dataTheme: html.getAttribute('data-theme'),
		dataMode: html.getAttribute('data-mode'),
		className: html.className,
		colorScheme: html.style.colorScheme,
		storage: { ...localStorage },
		transitionStyles: [...document.head.querySelectorAll('style')].map((style) =>
			style.getAttribute('nonce'),
		),
		value: { theme, resolvedTheme, systemTheme, forcedTheme, themes },
	};
}
type Observation = ReturnType<typeof observe>;

function reset(): void {
	vi.useRealTimers();
	system.dark = false;
	system.listeners.clear();
	localStorage.clear();
	html.removeAttribute('data-theme');
	html.removeAttribute('data-mode');
	html.removeAttribute('class');
	html.style.colorScheme = '';
	document.head.replaceChildren();
}

function run(
	create: () => Implementation,
	scenario: (implementation: Implementation, record: () => void) => void,
): Observation[] {
	reset();
	const implementation = create();
	const observations: Observation[] = [];
	try {
		scenario(implementation, () => observations.push(observe(implementation)));
	} finally {
		implementation.unmount();
	}
	return observations;
}

function compare(scenario: (implementation: Implementation, record: () => void) => void) {
	const react = run(reactImplementation, scenario);
	const octane = run(octaneImplementation, scenario);
	expect(octane).toEqual(react);
	return react;
}

function storageEvent(newValue: string | null, key = 'theme'): void {
	if (newValue === null) localStorage.removeItem(key);
	else localStorage.setItem(key, newValue);
	window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
}

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	window.matchMedia = ((media: string) => ({
		get matches() {
			return system.dark;
		},
		media,
		addListener(listener: MediaListener) {
			system.listeners.add(listener);
		},
		removeListener(listener: MediaListener) {
			system.listeners.delete(listener);
		},
	})) as unknown as typeof window.matchMedia;
});

beforeEach(reset);
afterEach(reset);

describe('@octanejs/next-themes against next-themes 0.4.6', () => {
	// @parity-case differential:next-themes-set-theme
	it('persists setTheme, mapping values onto class and data attributes', () => {
		const steps = compare((implementation, record) => {
			localStorage.setItem('custom', 'pink');
			implementation.mount({
				attribute: ['class', 'data-mode'],
				storageKey: 'custom',
				themes: ['pink', 'light', 'dark'],
				value: { pink: 'theme-pink', dark: 'theme-dark' },
			});
			record();
			implementation.step(() => implementation.value().setTheme('dark'));
			record();
			implementation.step(() => implementation.value().setTheme('light'));
			record();
			implementation.step(() =>
				implementation.value().setTheme((theme) => (theme === 'light' ? 'pink' : 'light')),
			);
			record();
		});
		expect(steps.map(({ className, dataMode }) => [className, dataMode])).toEqual([
			['theme-pink', 'theme-pink'],
			['theme-dark', 'theme-dark'],
			['', null],
			['theme-pink', 'theme-pink'],
		]);
	});

	// @parity-case differential:next-themes-system-preference
	it('follows the system preference only while the theme is system', () => {
		const steps = compare((implementation, record) => {
			implementation.mount({});
			record();
			implementation.step(() => setSystemDark(true));
			record();
			implementation.step(() => implementation.value().setTheme('light'));
			record();
			implementation.step(() => setSystemDark(false));
			record();
		});
		expect(steps.map(({ dataTheme, value }) => [dataTheme, value.systemTheme])).toEqual([
			['light', 'light'],
			['dark', 'dark'],
			['light', 'dark'],
			['light', 'light'],
		]);
	});

	// @parity-case differential:next-themes-storage-event
	it('syncs with storage events from other tabs and falls back to defaultTheme', () => {
		const steps = compare((implementation, record) => {
			implementation.mount({ defaultTheme: 'dark', enableSystem: false });
			record();
			implementation.step(() => storageEvent('light'));
			record();
			implementation.step(() => storageEvent('dark', 'unrelated'));
			record();
			implementation.step(() => storageEvent(null));
			record();
		});
		expect(steps.map(({ value }) => value.theme)).toEqual(['dark', 'light', 'light', 'dark']);
	});

	// @parity-case differential:next-themes-forced-theme
	it('applies forcedTheme to the page while keeping the chosen theme', () => {
		const steps = compare((implementation, record) => {
			localStorage.setItem('theme', 'light');
			implementation.mount({ forcedTheme: 'dark' });
			record();
			implementation.step(() => implementation.value().setTheme('pink'));
			record();
		});
		expect(steps.map(({ dataTheme, value }) => [dataTheme, value.theme])).toEqual([
			['dark', 'light'],
			['dark', 'pink'],
		]);
	});

	// @parity-case differential:next-themes-disable-transition
	it('blocks transitions with a nonce-bearing style for one tick when the theme changes', () => {
		const steps = compare((implementation, record) => {
			vi.useFakeTimers();
			implementation.mount({ disableTransitionOnChange: true, nonce: 'n0nce' });
			vi.runAllTimers();
			record();
			implementation.step(() => implementation.value().setTheme('dark'));
			record();
			vi.runAllTimers();
			record();
		});
		expect(steps.map(({ transitionStyles }) => transitionStyles)).toEqual([[], ['n0nce'], []]);
	});

	// @parity-case differential:next-themes-inline-script
	it('serves an inline script that sets the same page state before hydration', async () => {
		const ServerUpstream = await loadServerUpstream();
		const configurations: Array<[string, ThemeProviderProps, () => void]> = [
			['stored theme', {}, () => localStorage.setItem('theme', 'dark')],
			['system preference', {}, () => (system.dark = true)],
			['system disabled', { enableSystem: false, defaultTheme: 'system' }, () => {}],
			['forced theme', { forcedTheme: 'dark', attribute: 'class' }, () => {}],
			[
				'value mapping on class and data attributes',
				{
					attribute: ['class', 'data-mode'],
					storageKey: 'custom',
					themes: ['pink', 'light'],
					value: { pink: 'theme-pink' },
				},
				() => localStorage.setItem('custom', 'pink'),
			],
			['color-scheme disabled', { enableColorScheme: false }, () => {}],
			[
				'nonce and scriptProps',
				{ nonce: 'n0nce', scriptProps: { id: 'theme-script', 'data-cfasync': 'false' } },
				() => {},
			],
		];
		for (const [name, props, arrange] of configurations) {
			const pages = [
				() =>
					withoutWindow(() =>
						renderReactToString(createElement(ServerUpstream.ThemeProvider, props)),
					),
				() => renderProviderToString(props),
			].map((render) => {
				reset();
				const template = document.createElement('template');
				template.innerHTML = render();
				const scripts = template.content.querySelectorAll('script');
				expect(scripts, name).toHaveLength(1);
				arrange();
				runInlineScript(scripts[0]);
				return {
					attributes: scripts[0]
						.getAttributeNames()
						.sort()
						.map((attribute) => [attribute, scripts[0].getAttribute(attribute)]),
					dataTheme: html.getAttribute('data-theme'),
					dataMode: html.getAttribute('data-mode'),
					className: html.className,
					colorScheme: html.style.colorScheme,
				};
			});
			expect(pages[1], name).toEqual(pages[0]);
		}
	});
});

// next-themes decides whether it runs on a server when its module loads, so the
// server reference is a fresh copy of the pinned module evaluated without one.
async function loadServerUpstream(): Promise<typeof Upstream> {
	vi.stubGlobal('window', undefined);
	try {
		vi.resetModules();
		return await import('../../upstream/src/index.tsx');
	} finally {
		vi.unstubAllGlobals();
	}
}

function withoutWindow<T>(render: () => T): T {
	vi.stubGlobal('window', undefined);
	try {
		return render();
	} finally {
		vi.unstubAllGlobals();
	}
}
