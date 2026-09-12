import { describe, expect, it, vi } from 'vitest';
import { createOctaneCompiler } from '../../src/compiler/bundler.js';
import {
	bootstrapIndependentHydration,
	type IndependentHydrateActivationContext,
} from '../../src/hydration/independent-island.js';
import { flushSync, hydrateRoot, type Root } from '../../src/index.js';
import { renderToString } from '../../src/runtime.server.js';
import * as Signals from '../../src/signals/index.js';
import { evaluateCompiledFixtureCode, loadCompiledFixtureSource } from '../_server-fixture.js';

describe('independent widget and parent ownership', () => {
	it.each(
		[false, true].flatMap((dev) =>
			[false, true].flatMap((parentFirst) =>
				['inline', 'imported', 'local', 'signals'].flatMap((kind) =>
					[false, true].map((stale) => ({ dev, parentFirst, kind, stale })),
				),
			),
		),
	)(
		'preserves an independently owned input through parent hydration and updates (%j)',
		async ({ dev, parentFirst, kind, stale }) => {
			const withIds = kind !== 'inline';
			const widgetDeclarations = `export function Widget() @{ const id = useId(); ${kind === 'signals' ? "const handle = other$.get() === 'A' ? value$ : second$;" : ''} <section ${kind === 'signals' ? 'data-other={other$.get()}' : ''}><label htmlFor={id}>Draft<input id={id} ${kind === 'signals' ? 'value={handle}' : 'defaultValue="server"'} /></label>${kind === 'signals' ? '<p>{length$}</p>' : ''}<button type="button" onClick={record}>Choose</button></section> }
export function Neighbor() @{ const id = useId(); <label htmlFor={id}>Neighbor<input id={id} /></label> }`;
			const source = `import { Hydrate, useId } from 'octane';
import { interaction } from 'octane/hydration';
import { record } from './actions';
${kind === 'local' ? widgetDeclarations.replaceAll('export ', '') : withIds ? `import { Widget, Neighbor${kind === 'signals' ? ', other$' : ''} } from './widgets';` : ''}
export function App(props) @{
  const neighborId = useId();
  <main><h1>{props.title as string}</h1>
    <Hydrate independent when={interaction()}>
      ${withIds ? '<Widget />' : '<section><label>Draft<input defaultValue="server" /></label><button type="button" onClick={record}>Choose</button></section>'}
    </Hydrate>
    ${withIds ? '<Neighbor />' : '<label htmlFor={neighborId}>Neighbor<input id={neighborId} /></label>'}
    ${kind === 'signals' ? '<button type="button" data-switch onClick={() => other$.set(other$.get() === "A" ? "B" : "A")}>Switch</button>' : ''}
  </main>
}`;
			const file = '/project/src/IndependentParent.tsrx';
			const record = vi.fn();
			const widgets = `import { useId } from 'octane';
import { record } from './actions';
${kind === 'signals' ? "import { signal$, derived$ } from 'octane/signals'; const value$ = signal$('server'); const second$ = signal$('second'); export const other$ = signal$('A'); const length$ = derived$(() => String((other$.get() === 'A' ? value$.get() : second$.get()).length));" : ''}
${widgetDeclarations}`;
			const serverModules = {
				'./actions': { record() {} },
				'./widgets': loadCompiledFixtureSource(widgets, {
					id: `/project/src/widgets-${dev}-${parentFirst}-${kind}-${stale}.tsrx`,
					mode: 'server',
					compileOptions: { dev },
					runtimeModules: { './actions': { record() {} }, 'octane/signals': Signals },
				}),
			};
			const clientModules = {
				'./actions': { record },
				'./widgets': loadCompiledFixtureSource(widgets, {
					id: `/project/src/widgets-${dev}-${parentFirst}-${kind}-${stale}.tsrx`,
					mode: 'client',
					compileOptions: { dev },
					runtimeModules: { './actions': { record }, 'octane/signals': Signals },
				}),
			};
			const compiler = createOctaneCompiler({ root: '/project', hmr: false, dev });
			const server = evaluateCompiledFixtureCode(
				compiler.transform(source, file, { environment: 'server' })!.code,
				file,
				'server',
				serverModules,
			);
			const client = evaluateCompiledFixtureCode(
				compiler.transform(source, file, { environment: 'client' })!.code,
				file,
				'client',
				clientModules,
			);
			const child = evaluateCompiledFixtureCode(
				compiler.transform(source, file + '?octane-hydrate=0', { environment: 'client' })!.code,
				file,
				'client',
				clientModules,
			);
			const container = document.createElement('div');
			container.innerHTML = renderToString(
				server.App,
				{ title: 'Before' },
				{
					independentHydration: {
						buildId: 'parent-test',
						resolve: () => ({ moduleId: 'widget', styles: [] }),
					},
				},
			).html;
			document.body.append(container);
			const input = container.querySelector('input')!;
			const inputId = input.id;
			const neighbor = container.querySelectorAll('input')[1];
			const neighborId = neighbor.id;
			let button = container.querySelector('button')!;
			const errors: unknown[] = [];
			let root: Root | undefined;
			let activated = false;
			const cleanup = bootstrapIndependentHydration(container, {
				buildId: 'parent-test',
				loadStyles() {},
				loadModule: async () => ({
					default(context: IndependentHydrateActivationContext) {
						const active = child.default(context);
						activated = true;
						return active;
					},
				}),
				onError: (error) => errors.push(error),
			});
			const hydrateParent = () => {
				root = hydrateRoot(container, client.App, { title: 'Before' });
			};
			try {
				if (parentFirst) hydrateParent();
				button.click();
				if (stale) {
					const replacement = button.cloneNode(true) as HTMLButtonElement;
					button.replaceWith(replacement);
					button = replacement;
				}
				await expect.poll(() => activated).toBe(true);
				expect(record).toHaveBeenCalledTimes(stale ? 0 : 1);
				expect(container.querySelector('input')).toBe(input);
				expect(input.id).toBe(inputId);
				if (kind === 'signals') expect(container.querySelector('p')?.textContent).toBe('6');
				input.focus();
				input.value = 'live draft';
				input.dispatchEvent(new InputEvent('input', { bubbles: true }));
				if (kind === 'signals')
					await expect.poll(() => container.querySelector('p')?.textContent).toBe('10');
				input.setSelectionRange(2, 5, 'backward');
				if (!parentFirst) hydrateParent();
				flushSync(() => root!.render(client.App, { title: 'After' }));
				expect(container.querySelector('h1')?.textContent).toBe('After');
				expect(container.querySelector('input')).toBe(input);
				expect(input.value).toBe('live draft');
				expect(document.activeElement).toBe(input);
				expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([
					2,
					5,
					'backward',
				]);
				expect(container.querySelectorAll('input')[1]).toBe(neighbor);
				expect(neighbor.id).toBe(neighborId);
				button.click();
				expect(record).toHaveBeenCalledTimes(stale ? 1 : 2);
				if (kind === 'signals') {
					const switchButton = container.querySelector<HTMLButtonElement>('[data-switch]')!;
					switchButton.click();
					await expect.poll(() => input.value).toBe('second');
					expect(container.querySelector('p')?.textContent).toBe('6');
					switchButton.click();
					await expect.poll(() => input.value).toBe('live draft');
					expect(container.querySelector('p')?.textContent).toBe('10');
				}
				expect(errors).toEqual([]);
				root!.unmount();
				await Promise.resolve();
				expect(input.isConnected).toBe(false);
			} finally {
				root?.unmount();
				cleanup();
				container.remove();
			}
		},
	);
});
