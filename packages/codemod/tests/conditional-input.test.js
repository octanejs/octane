// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import { loadCompiledFixtureSource } from '../../octane/tests/_server-fixture.js';
import { transformModule } from '../dist/transform.js';

it.each([
	['an unkeyed input', '', '', true],
	['inputs with different keys', ' key="ready"', ' key="later"', false],
])(
	'preserves React input identity for %s across a conditional update',
	(_case, first, next, retained) => {
		const source = `export function View({ active }: { active: boolean }) {
		return <section>{active ? <input${first} defaultValue="ready" /> : <input${next} defaultValue="later" />}</section>;
	}`;
		const id = 'conditional-input.tsrx';
		const { code } = transformModule(source, 'conditional-input.tsx', { strong: true });
		const server = loadCompiledFixtureSource(code, { id, mode: 'server' });
		const client = loadCompiledFixtureSource(code, { id, mode: 'client' });
		const host = document.createElement('div');
		const initial = { active: true };
		host.innerHTML = renderToString(server.View, initial).html;
		document.body.appendChild(host);
		const input = host.querySelector('input');
		const recoveries = [];
		const root = hydrateRoot(host, client.View, initial, {
			onRecoverableError: (error) => recoveries.push(error),
		});
		try {
			expect(host.querySelector('input')).toBe(input);
			input.value = 'typed text';
			input.focus();
			input.setSelectionRange(2, 5);
			flushSync(() => root.render(client.View, { active: false }));
			const current = host.querySelector('input');
			expect(current === input).toBe(retained);
			expect(current.defaultValue).toBe('later');
			expect(current.value).toBe(retained ? 'typed text' : 'later');
			if (retained) {
				expect(document.activeElement).toBe(input);
				expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5]);
			}
			expect(recoveries).toEqual([]);
		} finally {
			root.unmount();
			host.remove();
		}
	},
);
