import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { loadServerFixture } from './_server-fixture.js';
import { mount } from './_helpers.js';
import * as client from './_fixtures/script-innerhtml.tsrx';

const FIXTURE = 'packages/octane/tests/_fixtures/script-innerhtml.tsrx';
const FIXTURE_SOURCE = readFileSync(resolve(process.cwd(), FIXTURE), 'utf8');
const server = loadServerFixture(FIXTURE);
const DANGER_CONFLICT = /Can only set one of `children` or `props\.dangerouslySetInnerHTML`/;

const BREAKOUT_VALUE = {
	lessThan: '<',
	ampersand: '&',
	quotes: `"'`,
	separators: '\u2028\u2029',
	lowercase: '</script><script data-pwn="lower">bad</script>',
	mixedCase: '</ScRiPt><ScRiPt data-pwn="mixed">bad</ScRiPt>',
};

const EXECUTABLE_SOURCE = `window.__octaneScriptValue = ${JSON.stringify(BREAKOUT_VALUE)};`;

const STATIC_JSON_VALUE = {
	nested: { enabled: true },
	chars: `<&"'`,
	boundary: '</ScRiPt><ScRiPt data-pwn="static">bad</ScRiPt>',
};

const SPLIT_DESCRIPTOR_VALUE = {
	boundary: '</script><script data-pwn="split">bad</script>',
};

const SPLIT_DESCRIPTOR_CHILDREN = [
	'{"boundary":"</scr',
	'ipt><scr',
	'ipt data-pwn=\\"split\\">bad</scr',
	'ipt>"}',
];

function parseFragment(html: string): DocumentFragment {
	const template = document.createElement('template');
	template.innerHTML = html;
	return template.content;
}

function authoredScriptBody(kind: string): string {
	const markerStart = FIXTURE_SOURCE.indexOf(`data-kind="${kind}"`);
	const bodyStart = FIXTURE_SOURCE.indexOf('>', markerStart) + 1;
	const bodyEnd = FIXTURE_SOURCE.indexOf('</script>', bodyStart);
	return FIXTURE_SOURCE.slice(bodyStart, bodyEnd);
}

describe('<script> content contract', () => {
	it('mounts and updates executable, application/json, and speculationrules content without parsing it as markup', () => {
		const executable = mount(client.ExecutableScript, { source: EXECUTABLE_SOURCE });
		const json = mount(client.JsonScript, { value: BREAKOUT_VALUE });
		const speculation = mount(client.SpeculationRules, {
			value: { prefetch: [{ source: 'list' }] },
		});
		try {
			const executableNode = executable.find('script');
			expect(executable.findAll('script')).toHaveLength(1);
			expect(executable.container.querySelector('[data-pwn]')).toBeNull();
			expect(executableNode.textContent).toBe(EXECUTABLE_SOURCE);

			const jsonNode = json.find('script');
			expect(jsonNode.getAttribute('type')).toBe('application/json');
			expect(json.container.querySelector('[data-pwn]')).toBeNull();
			expect(JSON.parse(jsonNode.textContent ?? '')).toEqual(BREAKOUT_VALUE);

			const speculationNode = speculation.find('script');
			expect(speculationNode.getAttribute('type')).toBe('speculationrules');
			expect(JSON.parse(speculationNode.textContent ?? '')).toEqual({
				prefetch: [{ source: 'list' }],
			});

			const next = { prefetch: [{ source: 'document', where: { href_matches: '/next/*' } }] };
			speculation.update(client.SpeculationRules, { value: next });
			expect(speculation.find('script')).toBe(speculationNode);
			expect(JSON.parse(speculationNode.textContent ?? '')).toEqual(next);
		} finally {
			executable.unmount();
			json.unmount();
			speculation.unmount();
		}
	});

	it('serializes dynamic script content as one safe, semantically intact script body', () => {
		for (const [component, props] of [
			[server.ExecutableScript, { source: EXECUTABLE_SOURCE }],
			[server.JsonScript, { value: BREAKOUT_VALUE }],
			[server.SpeculationRules, { value: BREAKOUT_VALUE }],
		] as const) {
			const { html } = ServerRuntime.renderToString(component, props);
			const fragment = parseFragment(html);
			const scripts = fragment.querySelectorAll('script');
			expect(scripts).toHaveLength(1);
			expect(fragment.querySelector('[data-pwn]')).toBeNull();
			expect(scripts[0].textContent).toContain('<');
			expect(scripts[0].textContent).toContain('&');
			expect(scripts[0].textContent).toContain(`"'`);
			expect(scripts[0].textContent).toContain('\u2028\u2029');
			if (scripts[0].getAttribute('type') === null) {
				const isolatedWindow: { __octaneScriptValue?: unknown } = {};
				new Function('window', scripts[0].textContent ?? '')(isolatedWindow);
				expect(isolatedWindow.__octaneScriptValue).toEqual(BREAKOUT_VALUE);
			} else {
				expect(JSON.parse(scripts[0].textContent ?? '')).toEqual(BREAKOUT_VALUE);
			}
		}
	});

	it('hydrates the server-safe script spelling by adoption and applies later updates', () => {
		const { html } = ServerRuntime.renderToString(server.SpeculationRules, {
			value: BREAKOUT_VALUE,
		});
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.appendChild(container);
		const serverNode = container.querySelector('script');
		const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, client.SpeculationRules, { value: BREAKOUT_VALUE });
		try {
			flushSync(() => {});
			expect(container.querySelector('script')).toBe(serverNode);
			expect(JSON.parse(serverNode?.textContent ?? '')).toEqual(BREAKOUT_VALUE);
			expect(warning).not.toHaveBeenCalled();

			const next = { value: '</script><script data-pwn="updated">bad</script>' };
			flushSync(() => root.render(client.SpeculationRules, { value: next }));
			expect(container.querySelector('script')).toBe(serverNode);
			expect(container.querySelectorAll('script')).toHaveLength(1);
			expect(container.querySelector('[data-pwn]')).toBeNull();
			expect(serverNode?.textContent).toBe(JSON.stringify(next));
		} finally {
			root.unmount();
			warning.mockRestore();
			container.remove();
		}
	});

	it('hydrates executable source after HTML script-data normalization', () => {
		const source =
			'/* nul:\u0000 */window.__first = 1;\r\nwindow.__boundary = "</ScRiPt>";\r' +
			'window.__entities = "&amp;&lt;&quot;&#39;";\nwindow.__last = 2;';
		const { html } = ServerRuntime.renderToString(server.ExecutableScript, { source });
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.appendChild(container);
		const serverNode = container.querySelector('script');
		const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, client.ExecutableScript, { source });
		try {
			flushSync(() => {});
			expect(container.querySelector('script')).toBe(serverNode);
			expect(serverNode?.textContent).not.toContain('\r');
			expect(serverNode?.textContent).not.toContain('\u0000');
			expect(serverNode?.textContent).toContain('\uFFFD');
			expect(warning).not.toHaveBeenCalled();
			const isolatedWindow: Record<string, unknown> = {};
			new Function('window', serverNode?.textContent ?? '')(isolatedWindow);
			expect(isolatedWindow).toMatchObject({
				__first: 1,
				__boundary: '</ScRiPt>',
				__entities: '&amp;&lt;&quot;&#39;',
				__last: 2,
			});
		} finally {
			root.unmount();
			warning.mockRestore();
			container.remove();
		}
	});

	it('preserves an authored static script body as raw source', () => {
		const expected = authoredScriptBody('static');
		const mounted = mount(client.StaticScript);
		try {
			expect(mounted.find('script').textContent).toBe(expected);
		} finally {
			mounted.unmount();
		}

		const { html } = ServerRuntime.renderToString(server.StaticScript);
		expect(parseFragment(html).querySelector('script')?.textContent).toBe(expected);
	});

	it('treats interpolation-looking braces as literal static script source', () => {
		const expected = authoredScriptBody('authored-expression');
		expect(expected).toContain('{JSON.stringify(props.value) as string}');
		const mounted = mount(client.AuthoredExpressionScript, { value: { first: true } });
		try {
			const script = mounted.find('script');
			expect(script.textContent).toBe(expected);
			mounted.update(client.AuthoredExpressionScript, { value: { second: true } });
			expect(mounted.find('script')).toBe(script);
			expect(script.textContent).toBe(expected);
		} finally {
			mounted.unmount();
		}

		for (const value of [{ first: true }, { second: true }]) {
			const { html } = ServerRuntime.renderToString(server.AuthoredExpressionScript, { value });
			expect(parseFragment(html).querySelector('script')?.textContent).toBe(expected);
		}
	});

	it('treats whitespace in a static script body as content when validating raw HTML', () => {
		const danger = { __html: 'dynamic' };
		expect(() => mount(client.WhitespaceDirectScript, { danger })).toThrow(DANGER_CONFLICT);
		const spread = mount(client.WhitespaceSpreadScript, { spread: {} });
		try {
			expect(() =>
				spread.update(client.WhitespaceSpreadScript, {
					spread: { dangerouslySetInnerHTML: danger },
				}),
			).toThrow(DANGER_CONFLICT);
		} finally {
			spread.unmount();
		}
		expect(() => ServerRuntime.renderToString(server.WhitespaceDirectScript, { danger })).toThrow(
			DANGER_CONFLICT,
		);
		expect(() =>
			ServerRuntime.renderToString(server.WhitespaceSpreadScript, {
				spread: { dangerouslySetInnerHTML: danger },
			}),
		).toThrow(DANGER_CONFLICT);
	});

	it('keeps static JSON boundary tokens inside the authored script element', () => {
		const mounted = mount(client.StaticJsonScript);
		try {
			expect(mounted.findAll('script')).toHaveLength(1);
			expect(mounted.container.querySelector('[data-pwn]')).toBeNull();
			expect(JSON.parse(mounted.find('script').textContent ?? '')).toEqual(STATIC_JSON_VALUE);
		} finally {
			mounted.unmount();
		}

		const { html } = ServerRuntime.renderToString(server.StaticJsonScript);
		const fragment = parseFragment(html);
		expect(fragment.querySelectorAll('script')).toHaveLength(1);
		expect(fragment.querySelector('[data-pwn]')).toBeNull();
		expect(JSON.parse(fragment.querySelector('script')?.textContent ?? '')).toEqual(
			STATIC_JSON_VALUE,
		);
	});

	it('preserves static script text when JSX lowers through a value-position descriptor', () => {
		const mounted = mount(client.ConditionalStaticJsonScript, { show: true });
		try {
			expect(mounted.findAll('script')).toHaveLength(1);
			expect(mounted.container.querySelector('[data-pwn]')).toBeNull();
			expect(JSON.parse(mounted.find('script').textContent ?? '')).toEqual(STATIC_JSON_VALUE);
		} finally {
			mounted.unmount();
		}

		const { html } = ServerRuntime.renderToString(server.ConditionalStaticJsonScript, {
			show: true,
		});
		const fragment = parseFragment(html);
		expect(fragment.querySelectorAll('script')).toHaveLength(1);
		expect(fragment.querySelector('[data-pwn]')).toBeNull();
		expect(JSON.parse(fragment.querySelector('script')?.textContent ?? '')).toEqual(
			STATIC_JSON_VALUE,
		);

		const whitespaceExpected = authoredScriptBody('conditional-whitespace');
		expect(whitespaceExpected).toContain('\n');
		expect(whitespaceExpected.trim()).toBe('');
		const whitespace = mount(client.ConditionalWhitespaceScript, { show: true });
		try {
			expect(whitespace.find('script').textContent).toBe(whitespaceExpected);
		} finally {
			whitespace.unmount();
		}
		const whitespaceHtml = ServerRuntime.renderToString(server.ConditionalWhitespaceScript, {
			show: true,
		}).html;
		expect(parseFragment(whitespaceHtml).querySelector('script')?.textContent).toBe(
			whitespaceExpected,
		);

		const SplitDescriptorScript = () =>
			ServerRuntime.createElement(
				'script',
				{ type: 'application/json' },
				...SPLIT_DESCRIPTOR_CHILDREN,
			);
		const split = parseFragment(ServerRuntime.renderToString(SplitDescriptorScript).html);
		expect(split.querySelectorAll('script')).toHaveLength(1);
		expect(split.querySelector('[data-pwn]')).toBeNull();
		expect(JSON.parse(split.querySelector('script')?.textContent ?? '')).toEqual(
			SPLIT_DESCRIPTOR_VALUE,
		);
	});
});
