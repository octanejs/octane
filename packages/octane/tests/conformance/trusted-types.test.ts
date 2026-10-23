import { afterEach, describe, expect, it, vi } from 'vitest';

// Installed before Octane loads, as a page's `trustedTypes` global is: the
// framework policy is created once, at module load. The per-test setup has
// already loaded the runtime, so this file loads a fresh copy after the fake.
const tt = vi.hoisted(() => {
	class Trusted {
		constructor(readonly value: string) {}
		toString() {
			return this.value;
		}
	}
	class TrustedHTML extends Trusted {}
	class TrustedScript extends Trusted {}
	class TrustedScriptURL extends Trusted {}
	const policies: string[] = [];
	(globalThis as any).trustedTypes = {
		createPolicy(name: string, rules: { createHTML(s: string): string }) {
			policies.push(name);
			return { createHTML: (s: string) => new TrustedHTML(rules.createHTML(s)) };
		},
		isHTML: (v: unknown) => v instanceof TrustedHTML,
		isScript: (v: unknown) => v instanceof TrustedScript,
		isScriptURL: (v: unknown) => v instanceof TrustedScriptURL,
	};
	vi.resetModules();
	return {
		policies,
		html: (s: string) => new TrustedHTML(s),
		script: (s: string) => new TrustedScript(s),
		scriptURL: (s: string) => new TrustedScriptURL(s),
		TrustedHTML,
	};
});

import { flushSync, hydrateRoot } from 'octane';
import * as ServerRuntime from 'octane/server';
import { mount } from '../_helpers.js';
import { loadServerFixture } from '../_server-fixture.js';
import * as client from './_fixtures/trusted-types.tsrx';

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/conformance/_fixtures/trusted-types.tsrx',
);

/** Every value written through `proto[prop]`'s setter while the spy is live. */
function spySetter(proto: object, prop: string): unknown[] {
	const values: unknown[] = [];
	const descriptor = Object.getOwnPropertyDescriptor(proto, prop)!;
	vi.spyOn(proto as any, prop, 'set').mockImplementation(function (this: any, value: unknown) {
		values.push(value);
		descriptor.set!.call(this, value);
	});
	return values;
}

function spyAttributes(): unknown[][] {
	const calls: unknown[][] = [];
	const set = Element.prototype.setAttribute;
	const setNS = Element.prototype.setAttributeNS;
	vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function (
		this: Element,
		name: string,
		value: any,
	) {
		calls.push([name, value]);
		set.call(this, name, value);
	});
	vi.spyOn(Element.prototype, 'setAttributeNS').mockImplementation(function (
		this: Element,
		ns: string | null,
		name: string,
		value: any,
	) {
		calls.push([ns, name, value]);
		setNS.call(this, ns, name, value);
	});
	return calls;
}

afterEach(() => {
	vi.restoreAllMocks();
});

// Per ReactDOM's trustedTypes-test.internal.js (19.3): React hands a Trusted
// Types object to its sink instead of the object's string.
describe('Trusted Types', () => {
	it('parses compiled templates through one `octane` policy', () => {
		const writes = spySetter(Element.prototype, 'innerHTML');
		const result = mount(client.Static);
		try {
			expect(result.container.querySelector('#static b')!.textContent).toBe('static');
			expect(tt.policies).toEqual(['octane']);
			expect(writes.length).toBeGreaterThan(0);
			for (const value of writes) expect(value).toBeInstanceOf(tt.TrustedHTML);
		} finally {
			result.unmount();
		}
	});

	it('writes a TrustedHTML dangerouslySetInnerHTML value itself on mount and update', () => {
		const first = tt.html('<i>one</i>');
		const second = tt.html('<i>two</i>');
		const result = mount(client.Html, { html: first });
		const writes = spySetter(Element.prototype, 'innerHTML');
		try {
			expect(result.container.querySelector('#html')!.innerHTML).toBe('<i>one</i>');
			flushSync(() => result.root.render(client.Html, { html: second }));
			expect(writes).toEqual([second]);
			expect(result.container.querySelector('#html')!.innerHTML).toBe('<i>two</i>');
			// A string keeps working where Trusted Types are not enforced.
			flushSync(() => result.root.render(client.Html, { html: '<i>three</i>' }));
			expect(writes).toEqual([second, '<i>three</i>']);
		} finally {
			result.unmount();
		}
	});

	it('writes a TrustedScript script body itself on mount and update', () => {
		const writes = spySetter(Node.prototype, 'textContent');
		const first = tt.script('{"a":1}');
		const second = tt.script('{"a":2}');
		const result = mount(client.ScriptText, { code: first });
		try {
			expect(writes).toContain(first);
			expect(result.container.querySelector('#script')!.textContent).toBe('{"a":1}');
			// A changed body reaches the script's sink, not its existing Text node.
			writes.length = 0;
			flushSync(() => result.root.render(client.ScriptText, { code: second }));
			expect(writes).toEqual([second]);
			expect(result.container.querySelector('#script')!.textContent).toBe('{"a":2}');
			// An unchanged body writes nothing.
			flushSync(() => result.root.render(client.ScriptText, { code: tt.script('{"a":2}') }));
			expect(writes).toEqual([second]);
		} finally {
			result.unmount();
		}
	});

	it('writes Trusted Types attribute values themselves', () => {
		const calls = spyAttributes();
		const doc = tt.html('<p>doc</p>');
		const src = tt.scriptURL('/app.js');
		const href = tt.scriptURL('/svg.js');
		const attrs = { srcdoc: tt.html('<p>spread</p>') };
		const results = [
			mount(client.Frame, { doc }),
			mount(client.ScriptSrc, { src }),
			mount(client.SvgScript, { href }),
			mount(client.Spread, { attrs }),
		];
		try {
			expect(calls).toContainEqual(['srcdoc', doc]);
			expect(calls).toContainEqual(['src', src]);
			expect(calls).toContainEqual(['http://www.w3.org/1999/xlink', 'xlink:href', href]);
			expect(calls).toContainEqual(['srcdoc', attrs.srcdoc]);
			expect(results[0].container.querySelector('#frame')!.getAttribute('srcdoc')).toBe(
				'<p>doc</p>',
			);
		} finally {
			for (const result of results) result.unmount();
		}
	});

	it('writes the sanitized string, not the object, for a javascript: URL', () => {
		const calls = spyAttributes();
		const result = mount(client.Link, { href: tt.scriptURL('javascript:alert(1)') });
		try {
			const href = calls.find((call) => call[0] === 'href')!;
			expect(typeof href[1]).toBe('string');
			expect(href[1]).not.toContain('alert(1)');
		} finally {
			result.unmount();
		}
	});

	it('still stringifies an ordinary object attribute once', () => {
		const calls = spyAttributes();
		const toString = vi.fn(() => '<p>object</p>');
		const result = mount(client.Frame, { doc: { toString } });
		try {
			expect(calls).toContainEqual(['srcdoc', '<p>object</p>']);
			expect(toString).toHaveBeenCalledTimes(1);
		} finally {
			result.unmount();
		}
	});

	it('hydrates Trusted Types dangerouslySetInnerHTML without a mismatch', () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const cases = [
			[client.Html, server.Html, { html: '<i>same</i>' }, { html: tt.html('<i>same</i>') }],
			[client.ScriptText, server.ScriptText, { code: '{"a":1}' }, { code: tt.script('{"a":1}') }],
		] as const;
		for (const [clientComponent, serverComponent, serverProps, clientProps] of cases) {
			const container = document.createElement('div');
			container.innerHTML = ServerRuntime.renderToString(serverComponent as any, serverProps).html;
			const root = hydrateRoot(container, clientComponent as any, clientProps);
			flushSync(() => {});
			root.unmount();
		}
		expect(consoleError).not.toHaveBeenCalled();
	});
});
