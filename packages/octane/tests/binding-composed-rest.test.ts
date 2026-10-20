import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import { compile } from '../src/compiler/index.js';
import { evaluateCompiledFixtureCode, type CompiledFixtureModule } from './_server-fixture.js';
import * as DomBindings from '../src/dom-bindings.js';
import * as DomBindingPrograms from '../src/dom-binding-program.js';
import * as DomBindingClasses from '../src/dom-binding-classes.js';
import * as DomBindingSignals from '../src/dom-binding-signals.js';
import * as DomBindingControls from '../src/dom-binding-controls.js';
import * as DomBindingStyles from '../src/dom-binding-styles.js';
import * as DomBindingProjections from '../src/dom-binding-projections.js';
import * as SignalReads from '../src/signals/read-protocol.js';

const RUNTIME_MODULES = {
	'octane/behavior': DomBindings,
	'octane/dom-bindings': DomBindings,
	'octane/dom-binding-program': DomBindingPrograms,
	'octane/dom-binding-classes': DomBindingClasses,
	'octane/dom-binding-signals': DomBindingSignals,
	'octane/dom-binding-controls': DomBindingControls,
	'octane/dom-binding-styles': DomBindingStyles,
	'octane/dom-binding-projections': DomBindingProjections,
	'octane/internal/signal-read': SignalReads,
};

const PROVIDER = {
	attrs: vi.fn((paint?: { className?: string; style?: string }) => ({
		class: paint?.className,
		style: paint?.style,
	})),
	href: (icon: string) => '#' + icon,
};

/** Compiles a `.tsrx` module graph, resolving each relative request through the compiler. */
function moduleGraph(sources: Record<string, string>, compileOptions: Record<string, unknown>) {
	const modules = new Map<string, CompiledFixtureModule>();
	const load = (request: string, mode: 'client' | 'server'): CompiledFixtureModule => {
		const id = '/src/' + request.replace(/^\.\//, '');
		const cached = modules.get(mode + id);
		if (cached) return cached;
		const { code } = compile(sources[id.split('?')[0]!]!, id, {
			...compileOptions,
			mode,
			knownAttributeSpreads: [
				{ source: 'provider', imported: 'attrs', fields: ['class', 'style'] },
			],
		});
		const runtimeModules: Record<string, CompiledFixtureModule> = {
			...RUNTIME_MODULES,
			provider: PROVIDER,
		};
		for (const [, dependency] of code.matchAll(/from\s*['"](\.\/[^'"]+)['"]/g))
			runtimeModules[dependency!] = load(dependency!, mode);
		const module = evaluateCompiledFixtureCode(code, id, mode, runtimeModules);
		modules.set(mode + id, module);
		return module;
	};
	return load;
}

function source<Props>(initial: Props) {
	let snapshot = initial;
	const subscriptions = new Set<() => void>();
	return {
		subscriptions,
		getSnapshot: () => snapshot,
		subscribe(notify: () => void) {
			subscriptions.add(notify);
			return () => subscriptions.delete(notify);
		},
		publish(next: Partial<Props>) {
			snapshot = { ...snapshot, ...next };
			for (const notify of [...subscriptions]) notify();
		},
	};
}

type Adopt = (root: Element, state: ReturnType<typeof source>) => DomBindings.BindingHandle;
type Mount = (
	target: DomBindingPrograms.BindingMountTarget,
	state: ReturnType<typeof source>,
) => DomBindings.BindingHandle;

afterEach(() => {
	document.body.innerHTML = '';
});

for (const dev of [false, true]) {
	describe(`composed binding views (${dev ? 'dev' : 'prod'})`, () => {
		const options = { dev, hmr: false, strong: !dev };

		it('omits unread setup from an early textarea binding projection', () => {
			const load = moduleGraph(
				{
					'/src/field.tsrx': `import { unbound } from 'octane/behavior';
export function Field(props) @{ 'use dom bindings';
 const unused = props.compute();
 <div><textarea value={unbound(props.model)} placeholder={props.hint} /></div>
}`,
					'/src/activate.tsrx': `import { adoptBindings } from 'octane/behavior';
import { Field } from './field.tsrx';
export function adopt(root, state) { return adoptBindings(root, Field, state); }`,
				},
				options,
			);
			const props = { model: 'initial', hint: 'before', compute: vi.fn(() => 'unused') };
			document.body.innerHTML = renderToString(
				load('./field.tsrx', 'server')['Field'] as never,
				props,
			).html;
			props.compute.mockClear();
			const state = source(props);
			const binding = (load('./activate.tsrx', 'client')['adopt'] as Adopt)(
				document.body.firstElementChild!,
				state,
			);
			try {
				state.publish({ hint: 'after' });
				expect(document.querySelector('textarea')!.placeholder).toBe('after');
				expect(props.compute).not.toHaveBeenCalled();
			} finally {
				binding.dispose();
			}
		});

		it('forwards a closed parameter rest to a child with later props taking precedence', () => {
			const load = moduleGraph(
				{
					'/src/leaf.tsrx': `export function Leaf({ ...props }) @{ 'use dom bindings';
 <button {...props}>Action</button>;
}`,
					'/src/wrapper.tsrx': `import { Leaf } from './leaf.tsrx';
export function Wrapper({ ...props }) @{ 'use dom bindings';
 <Leaf disabled={true} {...props} disabled={props.locked} />;
}
export function Outer({ ...rest }) @{ 'use dom bindings';
 <Wrapper {...rest} />;
}`,
					'/src/action.tsrx': `import { Outer } from './wrapper.tsrx';
export function Action(props) @{ 'use dom bindings';
 <Outer aria-label={props.label} locked={props.locked} />;
}`,
					'/src/activate.tsrx': `import { adoptBindings } from 'octane/behavior';
import { Action } from './action.tsrx';
export function adopt(root, state) { return adoptBindings(root, Action, state); }`,
				},
				options,
			);
			const state = source({ label: 'Server', locked: false });
			document.body.innerHTML = renderToString(
				load('./action.tsrx', 'server')['Action'] as never,
				state.getSnapshot(),
			).html;
			const button = document.querySelector('button')!;
			expect(button.getAttribute('aria-label')).toBe('Server');
			expect(button.disabled).toBe(false);
			const handle = (load('./activate.tsrx', 'client')['adopt'] as Adopt)(button, state);
			state.publish({ label: 'Early', locked: true });
			expect(document.querySelector('button')).toBe(button);
			expect(button.getAttribute('aria-label')).toBe('Early');
			expect(button.disabled).toBe(true);
			handle.dispose();
			expect(state.subscriptions.size).toBe(0);

			// An open caller shape still cannot be extracted.
			expect(() =>
				compile(
					`import { Leaf } from './leaf.tsrx';
export function Wrapper({ ...props }) @{ 'use dom bindings'; <Leaf {...props} />; }`,
					'/src/open.tsrx?octane-bindings=Wrapper',
					{ ...options, mode: 'client' },
				),
			).toThrow(/binding child program props must be explicit/);
		});

		it('adopts a native root owned by a conditional child arm', () => {
			const load = moduleGraph(
				{
					'/src/range.tsrx': `export function Leaf({ disabled }) @{ 'use dom bindings';
 <button disabled={disabled}>Action</button>;
}
export function Wrapper({ alternate, disabled }) @{ 'use dom bindings';
 @if (alternate) { <Leaf disabled={disabled} />; }
 @else { <Leaf disabled={disabled} />; }
}
export function Action(props) @{ 'use dom bindings';
 <Wrapper alternate={props.alternate} disabled={props.disabled} />;
}`,
					'/src/activate.tsrx': `import { adoptBindings } from 'octane/behavior';
import { Action } from './range.tsrx';
export function adopt(root, state) { return adoptBindings(root, Action, state); }`,
				},
				options,
			);
			const adopt = load('./activate.tsrx', 'client')['adopt'] as Adopt;
			const state = source({ alternate: false, disabled: false });
			const html = renderToString(
				load('./range.tsrx', 'server')['Action'] as never,
				state.getSnapshot(),
			).html;
			document.body.innerHTML = html;
			const button = document.querySelector('button')!;
			const handle = adopt(button, state);
			state.publish({ disabled: true });
			expect(document.querySelector('button')).toBe(button);
			expect(button.disabled).toBe(true);
			state.publish({ alternate: true, disabled: false });
			expect(document.querySelector('button')!.disabled).toBe(false);
			handle.dispose();
			expect(state.subscriptions.size).toBe(0);

			// The native root must still own the whole compiler range.
			document.body.innerHTML = html;
			const crowded = document.querySelector('button')!;
			crowded.after(document.createElement('span'));
			expect(() => adopt(crowded, state)).toThrow(/mismatched compiler-owned/);
		});

		it('hands scalar closed-rest channels on a composed button to the renderer', async () => {
			const sources = {
				'/src/handoff.tsrx': `export function Leaf({ children, ...props }) @{ 'use dom bindings';
 <button {...props}>{children}</button>;
}
export function Wrapper({ alternate, children, disabled, hidden, type, popovertarget, onClick }) @{ 'use dom bindings';
 @if (alternate) { <Leaf disabled={disabled} hidden={hidden} type={type} popovertarget={popovertarget} onClick={onClick}>{children}</Leaf>; }
 @else { <Leaf disabled={disabled} hidden={hidden} type={type} popovertarget={popovertarget} onClick={onClick}>{children}</Leaf>; }
}
export function Action(props) @{ 'use dom bindings';
 <Wrapper alternate={props.alternate} disabled={props.disabled} hidden={props.hidden} type="button" popovertarget={props.target} onClick={props.onClick}>
  @if (props.icon) { <svg viewBox="0 0 24 24"><path d="M0 0h24" /></svg>; }
 </Wrapper>;
}`,
				'/src/activate.tsrx': `import { adoptBindings } from 'octane/behavior';
import { Action } from './handoff.tsrx';
export function adopt(root, state) { return adoptBindings(root, Action, state); }`,
			};
			for (const icon of [false, true]) {
				const load = moduleGraph(sources, options);
				const onClick = vi.fn();
				const state = source({
					alternate: false,
					disabled: false,
					hidden: false,
					target: 'menu',
					icon,
					onClick,
				});
				document.body.innerHTML = renderToString(
					load('./handoff.tsrx', 'server')['Action'] as never,
					state.getSnapshot(),
				).html;
				const button = document.querySelector('button')!;
				const binding = (load('./activate.tsrx', 'client')['adopt'] as Adopt)(button, state);
				button.click();
				expect(onClick).toHaveBeenCalledOnce();
				const errors: unknown[] = [];
				const Action = load('./handoff.tsrx', 'client')['Action'] as never;
				const root = hydrateRoot(document.body, Action, state.getSnapshot(), {
					bindingLeases: [binding],
					onRecoverableError: (error) => errors.push(error),
				});
				await act(() => {});
				expect(errors).toEqual([]);
				expect(document.querySelector('button')).toBe(button);
				expect(state.subscriptions.size).toBe(0);
				button.click();
				expect(onClick).toHaveBeenCalledTimes(2);
				await act(() =>
					root.render(Action, { ...state.getSnapshot(), disabled: true, hidden: true } as never),
				);
				expect(button.disabled).toBe(true);
				expect(button.hidden).toBe(true);
				expect(button.getAttribute('popovertarget')).toBe('menu');
				await act(() => root.unmount());
			}
		});

		for (const [name, view, file] of [
			[
				'a verified unbound provider inside a native slot',
				'Nested',
				`import { unbound } from 'octane/behavior';
import { attrs } from 'provider';
export function Native({ children, ...props }) @{ 'use dom bindings';
 <button {...props}>{children}</button>;
}
export function Nested(props) @{ 'use dom bindings';
 <Native onClick={props.onClick} aria-label={props.label}>
  <svg {...unbound(attrs(props.paint))}><path d="M0 0h24" /></svg>
 </Native>;
}`,
			],
			[
				'an externally owned host behind pure aliases',
				'Host',
				`import { unbound } from 'octane/behavior';
import { attrs } from 'provider';
export function Host(props) @{ 'use dom bindings';
 const layout = props.layout;
 const expanded = layout.expanded;
 const paint = props.paint;
 <div {...attrs({ className: expanded ? 'open' : 'closed' })} title={unbound(paint.className)}>{unbound(props.children)}</div>;
}`,
			],
		] as const) {
			it(`hands ${name} to the renderer`, async () => {
				const load = moduleGraph(
					{
						'/src/view.tsrx': file,
						'/src/activate.tsrx': `import { adoptBindings } from 'octane/behavior';
import { ${view} } from './view.tsrx';
export function adopt(root, state) { return adoptBindings(root, ${view}, state); }`,
						'/src/mount.tsrx': `import { mountBindings } from 'octane/behavior';
import { ${view} } from './view.tsrx';
export function mount(target, state) { return mountBindings(target, ${view}, state); }`,
					},
					options,
				);
				const onClick = vi.fn();
				const props = {
					label: 'Action',
					onClick,
					paint: { className: 'original', style: 'color:red' },
					layout: { expanded: true },
				};
				document.body.innerHTML = renderToString(
					load('./view.tsrx', 'server')[view] as never,
					props,
				).html;
				const host = document.querySelector('button,div')!;
				const svg = host.querySelector('svg');
				const presentation = () => [
					host.getAttribute('class'),
					svg?.getAttribute('class'),
					(svg as SVGElement | null)?.style.color,
				];
				const presented = presentation();
				let omittedReads = 0;
				const state = source({
					...props,
					get paint() {
						omittedReads++;
						throw new Error('adoption evaluated an omitted unbound prop');
					},
				});
				const binding = (load('./activate.tsrx', 'client')['adopt'] as Adopt)(host, state);
				expect(omittedReads).toBe(0);
				expect(presentation()).toEqual(
					view === 'Nested' ? [null, 'original', 'red'] : ['open', undefined, undefined],
				);
				const errors: unknown[] = [];
				const root = hydrateRoot(
					document.body,
					load('./view.tsrx', 'client')[view] as never,
					props,
					{
						bindingLeases: [binding],
						onRecoverableError: (error) => errors.push(error),
					},
				);
				await act(() => {});
				expect(errors).toEqual([]);
				expect(document.querySelector('button,div')).toBe(host);
				expect(host.querySelector('svg')).toBe(svg);
				expect(presentation()).toEqual(presented);
				expect(state.subscriptions.size).toBe(0);
				if (view === 'Nested') {
					(host as HTMLElement).click();
					expect(onClick).toHaveBeenCalledOnce();
				}
				await act(() => root.unmount());

				if (view !== 'Nested') return;
				// A fresh node applies every provider field from one provider call.
				PROVIDER.attrs.mockClear();
				const parent = document.createElement('div');
				document.body.append(parent);
				const mounted = (load('./mount.tsrx', 'client')['mount'] as Mount)(
					{ parent },
					source(props),
				);
				const fresh = parent.querySelector('svg')!;
				expect(PROVIDER.attrs).toHaveBeenCalledOnce();
				expect([fresh.getAttribute('class'), fresh.style.color]).toEqual(['original', 'red']);
				mounted.dispose();
			});
		}
	});
}
