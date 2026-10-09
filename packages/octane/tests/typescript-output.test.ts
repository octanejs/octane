// @vitest-environment jsdom
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { renderToString } from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { mount } from './_helpers.js';
import { evaluateCompiledFixtureCode } from './_server-fixture.js';

const SOURCE = `import { useState, useMemo, useCallback } from 'octane';
export interface Item { id: string; label: string }
export interface Props { items: Item[]; visible: boolean; label: string }
export function App(props: Props) @{
	const [count, setCount, getCount] = useState<number>(0);
	const text = useMemo<string>(() => props.label + count);
	const click = useCallback(() => setCount(getCount() + 1));
	<section>
		<button data-counter onClick={click}>{text as string}</button>
		@if (props.visible) {
			<ul>@for (const item of props.items; key item.id) {
				type Label = string;
				const label: Label = item.label;
				<li data-id={item.id}>{label as string}</li>
			} @empty { <li>empty</li> }</ul>
		} @else { <p>hidden</p> }
	</section>
}`;

function fixture(output: 'js' | 'ts', mode: 'client' | 'server', dev: boolean) {
	const filename = '/src/TypeScriptOutput.tsrx';
	const result = compile(SOURCE, filename, { output, mode, dev, hmr: false });
	const code =
		output === 'ts'
			? ts.transpileModule(result.code, {
					fileName: 'TypeScriptOutput.ts',
					compilerOptions: {
						module: ts.ModuleKind.ESNext,
						target: ts.ScriptTarget.ES2022,
						verbatimModuleSyntax: true,
					},
				}).outputText
			: result.code;
	return evaluateCompiledFixtureCode(code, filename, mode, undefined);
}

const initial = {
	items: [
		{ id: 'a', label: 'A' },
		{ id: 'b', label: 'B' },
	],
	visible: true,
	label: 'Count:',
};

describe.each([false, true])('web TypeScript execution in dev=%s', (dev) => {
	it('preserves state, inferred callbacks, conditionals and keyed row identity after transpilation', () => {
		const snapshots: string[][] = [];
		for (const output of ['js', 'ts'] as const) {
			const { App } = fixture(output, 'client', dev);
			const view = mount(App, initial);
			try {
				const snapshot = () =>
					`${view.find('button').textContent}|${view.find('section').textContent}`;
				const states = [snapshot()];
				const row = view.find('[data-id="a"]');
				view.click('button');
				states.push(snapshot());
				view.update(App, { ...initial, items: [...initial.items].reverse(), label: 'Next:' });
				expect(view.find('[data-id="a"]')).toBe(row);
				states.push(snapshot());
				view.update(App, { ...initial, visible: false });
				states.push(snapshot());
				view.update(App, { ...initial, items: [] });
				states.push(snapshot());
				expect(states).toEqual([
					'Count:0|Count:0AB',
					'Count:1|Count:1AB',
					'Next:1|Next:1BA',
					'Count:1|Count:1hidden',
					'Count:1|Count:1empty',
				]);
				snapshots.push(states);
			} finally {
				view.unmount();
			}
		}
		expect(snapshots[1]).toEqual(snapshots[0]);
	});

	it('preserves server markup and control-flow branches after transpilation', () => {
		const javascript = fixture('js', 'server', dev);
		const typescript = fixture('ts', 'server', dev);
		for (const props of [initial, { ...initial, visible: false }, { ...initial, items: [] }]) {
			const before = renderToString(javascript.App, props);
			const after = renderToString(typescript.App, props);
			expect(after).toEqual(before);
			const container = document.createElement('div');
			container.innerHTML = after.html;
			expect(container.querySelector('button')?.textContent).toBe('Count:0');
			expect(container.querySelector('section')?.textContent).toBe(
				!props.visible ? 'Count:0hidden' : props.items.length === 0 ? 'Count:0empty' : 'Count:0AB',
			);
		}
	});

	it('hydrates transpiled TypeScript by adopting server nodes and retaining live state', () => {
		const server = fixture('ts', 'server', dev);
		const client = fixture('ts', 'client', dev);
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = renderToString(server.App, initial).html;
		const section = container.querySelector('section');
		const button = container.querySelector('button')!;
		const row = container.querySelector('[data-id="a"]');
		const recoverable: unknown[] = [];
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			root = hydrateRoot(container, client.App, initial, {
				onRecoverableError: (error) => recoverable.push(error),
			});
			expect(container.querySelector('section')).toBe(section);
			expect(container.querySelector('button')).toBe(button);
			expect(container.querySelector('[data-id="a"]')).toBe(row);
			flushSync(() => button.click());
			expect(button.textContent).toBe('Count:1');
			flushSync(() =>
				root!.render(client.App, { ...initial, items: [...initial.items].reverse() }),
			);
			expect(container.querySelector('[data-id="a"]')).toBe(row);
			expect(container.querySelector('section')?.textContent).toBe('Count:1BA');
			expect(recoverable).toEqual([]);
		} finally {
			root?.unmount();
			container.remove();
		}
	});
});
