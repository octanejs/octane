/**
 * ViewTransition feature tests (octane-side coverage beyond the conformance
 * ports in conformance/view-transition.test.ts): addTransitionType types
 * reaching callbacks + per-type class maps, 'none' deactivation, name/class
 * style application inside the transition window, the callback instance's
 * pseudo-element handles, cleanup-before-next-fire, and share viewport decay.
 * jsdom environment via the shared conformance mock helper.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from './_helpers';
import { createRoot, startTransition, addTransitionType, type Root } from '../src/index.js';
import { compile } from '../src/compiler/compile.js';
import * as ServerRuntime from '../src/server/index.js';
import {
	installViewTransitionMocks,
	type ViewTransitionMocks,
} from './conformance/_helpers/view-transition-mocks';
import {
	TypedUpdateApp,
	NoneMapApp,
	NamedShareApp,
	CleanupApp,
	RevealApp,
	FirstBoundaryRevealApp,
	ClickUpdateApp,
	PlainClickApp,
} from './_fixtures/view-transition-features.tsrx';

function evalServer(source: string, filename: string): Record<string, any> {
	let code = compile(source, filename, { mode: 'server' }).code;
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane(?:\/server)?['"];?/g,
		(_match, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRuntime, {});
}

describe('ViewTransition compiler hints', () => {
	const expectHint = (source: string, filename: string) => {
		const code = compile(source, filename).code;
		expect(code).toContain('__vtSeen as _$__vtSeen');
		expect(code).toContain('_$__vtSeen();');
	};

	const expectNoHint = (source: string, filename: string) => {
		expect(compile(source, filename).code).not.toContain('__vtSeen');
	};

	it('does not arm transitions for an unrelated Octane namespace import', () => {
		expectNoHint(
			`import * as Octane from 'octane'; export function App() @{ <p>{Octane.useId()}</p> }`,
			'namespace-hook.tsrx',
		);
	});

	it('arms transitions for a namespace ViewTransition tag', () => {
		expectHint(
			`import * as Octane from 'octane'; export function App() @{ <Octane.ViewTransition><p /></Octane.ViewTransition> }`,
			'namespace-view-transition.tsrx',
		);
	});

	it.each([
		['stable', 'ViewTransition'],
		['unstable', 'unstable_ViewTransition'],
		['computed stable', "['ViewTransition']"],
		['computed unstable', "['unstable_ViewTransition']"],
	])('arms transitions for a top-level %s namespace destructuring alias', (_, property) => {
		expectHint(
			`import * as Octane from 'octane'; const { ${property}: VT } = Octane; export function App() @{ <VT><p /></VT> }`,
			'namespace-destructure.tsrx',
		);
	});

	it('does not treat destructuring from another object as an Octane alias', () => {
		expectNoHint(
			`import * as Octane from 'octane'; const other = { ViewTransition: () => null }; const { ViewTransition: VT } = other; export function App() @{ <p /> }`,
			'namespace-destructure-other.tsrx',
		);
	});

	it('does not arm for a lexically shadowed namespace member', () => {
		expectNoHint(
			`import * as Octane from 'octane'; function read(Octane: { ViewTransition: unknown }) { return Octane.ViewTransition; } export function App() @{ <p /> }`,
			'namespace-shadowed.tsrx',
		);
	});

	it('arms transitions through transitive module-level namespace aliases', () => {
		expectHint(
			`import * as Octane from 'octane'; const Short = Octane; const UI = Short; export function App() @{ <UI.ViewTransition><p /></UI.ViewTransition> }`,
			'namespace-transitive-alias.tsrx',
		);
	});

	it('does not arm for an unused namespace alias or its shadowed member', () => {
		expectNoHint(
			`import * as Octane from 'octane'; const UI = Octane; function read(UI: { ViewTransition: unknown }) { return UI.ViewTransition; } export function App() @{ <p /> }`,
			'namespace-alias-shadowed.tsrx',
		);
	});

	it.each(['ViewTransition as VT', 'unstable_ViewTransition as VT'])(
		'arms transitions for a direct Octane barrel export: %s',
		(specifier) => {
			expectHint(`export { ${specifier} } from 'octane';`, 'view-transition-barrel.tsrx');
		},
	);

	it.each([`export * from 'octane';`, `export * as Octane from 'octane';`])(
		'arms transitions for an Octane star barrel: %s',
		(source) => {
			expectHint(source, 'view-transition-star-barrel.tsrx');
		},
	);

	it('ignores type-only ViewTransition namespace and barrel exports', () => {
		expectNoHint(
			`import type * as Octane from 'octane'; type VT = typeof Octane.ViewTransition; export type { ViewTransition } from 'octane';`,
			'view-transition-type-only.tsrx',
		);
	});
});

describe('ViewTransition server output', () => {
	const ambient = evalServer(
		`
			import { ViewTransition, use, useState } from 'octane';
			function Invoke(props) { props.run(); return null; }
			export function Nested() @{
				@try { <span>{'nested'}</span> } @pending { <i>{'nested pending'}</i> }
			}
			export function NestedInsideViewTransition(props) @{
				<ViewTransition>
					<><Invoke run={props.run} /><div id="outer-after-nested">{'outer'}</div></>
				</ViewTransition>
			}
			function SettlingChild() @{
				const [settled, setSettled] = useState(false);
				if (!settled) setSettled(true);
				@if (!settled) {
					@try { <span>{'discarded try'}</span> } @pending { <i>{'discarded pending'}</i> }
				} @else {
					<div id="settled-without-try">{'settled'}</div>
				}
			}
			export function RenderPhaseViewTransition() @{
				<ViewTransition><SettlingChild /></ViewTransition>
			}
			function AsyncContent(props) @{
				const value = use(props.promise);
				<div id="streamed-vt-content">{value as string}</div>
			}
			export function NestedBeforeStream(props) @{
				<ViewTransition name="outer-name" update="fade" share="pair">
					<>
						<Invoke run={props.run} />
						@try {
							<AsyncContent promise={props.promise} />
						} @pending {
							<div id="streamed-vt-pending">{'pending'}</div>
						}
					</>
				</ViewTransition>
			}
		`,
		'view-transition-ambient-state.tsrx',
	);

	it('strips unclaimed enter/exit candidates from static markup', () => {
		const mod = evalServer(
			`
        import { ViewTransition } from 'octane';
        export function App() @{
          <ViewTransition enter="fade-in" exit="fade-out">
            <div id="static-vt">{'static'}</div>
          </ViewTransition>
        }
      `,
			'static-view-transition.tsrx',
		);
		const { html } = ServerRuntime.renderToStaticMarkup(mod.App);

		expect(html).toContain('id="static-vt"');
		expect(html).not.toContain('vt-enter-x');
		expect(html).not.toContain('vt-exit-x');
		expect(html).not.toContain('vt-enter=');
		expect(html).not.toContain('vt-exit=');
	});

	it('isolates nested buffered renders from an enclosing ViewTransition candidate', () => {
		const { html } = ServerRuntime.renderToString(ambient.NestedInsideViewTransition, {
			run: () => ServerRuntime.renderToString(ambient.Nested),
		});
		const root = document.createElement('div');
		root.innerHTML = html;
		const outer = root.querySelector('#outer-after-nested')!;
		expect(outer.getAttribute('vt-update')).toBe('auto');
		expect(outer.hasAttribute('vt-name')).toBe(false);
		expect(outer.hasAttribute('vt-share')).toBe(false);
	});

	it('rewinds discarded render-phase ViewTransition try state', () => {
		const { html } = ServerRuntime.renderToString(ambient.RenderPhaseViewTransition);
		const root = document.createElement('div');
		root.innerHTML = html;
		const settled = root.querySelector('#settled-without-try')!;
		expect(settled.getAttribute('vt-update')).toBe('auto');
		expect(settled.hasAttribute('vt-name')).toBe(false);
		expect(settled.hasAttribute('vt-share')).toBe(false);
	});

	it('preserves ViewTransition annotations after a nested buffered render before streaming', async () => {
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => {
			resolve = done;
		});
		const chunks: string[] = [];
		let finish!: () => void;
		const ended = new Promise<void>((done) => {
			finish = done;
		});
		ServerRuntime.renderToPipeableStream(ambient.NestedBeforeStream, {
			promise,
			run: () => ServerRuntime.renderToString(ambient.Nested),
		}).pipe({ write: (chunk: string) => chunks.push(chunk), end: finish });

		resolve('ready');
		await ended;
		const tail = chunks.slice(1).join('');
		expect(tail).toContain('id="streamed-vt-content"');
		expect(tail).toContain('vt-name="outer-name"');
		expect(tail).toContain('vt-update="fade"');
		expect(tail).toContain('vt-share="pair"');
	});
});

describe('ViewTransition features', () => {
	let vt: ViewTransitionMocks;
	let container: HTMLElement;
	let root: Root;

	beforeEach(() => {
		vt = installViewTransitionMocks();
		container = document.createElement('div');
		document.body.appendChild(container);
		root = createRoot(container);
	});
	afterEach(() => {
		root.unmount();
		container.remove();
		vt.restore();
	});

	it('passes addTransitionType types to callbacks and resolves per-type class maps', async () => {
		const seenTypes: string[][] = [];
		const seenInstances: unknown[] = [];
		// Capture applied styles at update time (they revert after `ready`).
		let styleAtUpdate = '';
		const props = {
			text: 'Short',
			onUpdate: (instance: unknown, types: string[]) => {
				seenInstances.push(instance);
				seenTypes.push(types);
			},
		};
		await act(() => {
			startTransition(() => {
				root.render(TypedUpdateApp, props);
			});
		});

		const origSVT = (document as never as Record<string, any>)['startViewTransition'];
		(document as never as Record<string, any>)['startViewTransition'] = (opts: {
			update: () => void;
		}) => {
			const handle = origSVT(opts);
			styleAtUpdate = container.querySelector('div')?.getAttribute('style') ?? '';
			return handle;
		};

		await act(() => {
			startTransition(() => {
				addTransitionType('nav-forward');
				addTransitionType('fast');
				root.render(TypedUpdateApp, { ...props, text: 'Much longer content here' });
			});
		});

		expect(seenTypes).toEqual([['nav-forward', 'fast']]);
		// The per-type map picked the 'nav-forward' class; it was applied as
		// view-transition-class alongside the name during the transition window.
		expect(styleAtUpdate).toContain('view-transition-name');
		expect(styleAtUpdate).toContain('view-transition-class: slide-left');
		// The instance carries the four pseudo-element handles.
		const inst = seenInstances[0] as {
			name: string;
			old: { selector: string; animate: unknown };
			new: { selector: string };
			group: { selector: string };
			imagePair: { selector: string };
		};
		expect(typeof inst.name).toBe('string');
		expect(inst.new.selector).toBe('::view-transition-new(' + inst.name + ')');
		expect(inst.group.selector).toBe('::view-transition-group(' + inst.name + ')');
		expect(inst.imagePair.selector).toBe('::view-transition-image-pair(' + inst.name + ')');
		expect(typeof inst.old.animate).toBe('function');

		(document as never as Record<string, any>)['startViewTransition'] = origSVT;
	});

	it("a type map resolving 'none' deactivates the boundary (no callback)", async () => {
		let updates = 0;
		const props = {
			text: 'Short',
			onUpdate: () => {
				updates++;
			},
		};
		await act(() => {
			startTransition(() => {
				root.render(NoneMapApp, props);
			});
		});

		// With the matching type, the map resolves 'none' → suppressed.
		await act(() => {
			startTransition(() => {
				addTransitionType('instant');
				root.render(NoneMapApp, { ...props, text: 'Much longer content here' });
			});
		});
		expect(updates).toBe(0);

		// Without the type, the map's default ('auto') applies → fires.
		await act(() => {
			startTransition(() => {
				root.render(NoneMapApp, { ...props, text: 'Different again entirely' });
			});
		});
		expect(updates).toBe(1);
	});

	it('share decays to exit/enter when the exiting side is out of the viewport', async () => {
		let shares = 0,
			exits = 0,
			enters = 0;
		const props = {
			page: 'a',
			onShareA: () => {
				shares++;
			},
			onExitA: () => {
				exits++;
			},
			onEnterB: () => {
				enters++;
			},
		};
		await act(() => {
			startTransition(() => {
				root.render(NamedShareApp, props);
			});
		});
		shares = exits = enters = 0;

		// Move the exiting element far off-screen: the pre-drain rect capture
		// sees it out of the viewport, so the named pair decays (React's rule).
		Element.prototype.getBoundingClientRect = function () {
			return new DOMRect(0, -5000, 100, 20);
		};

		await act(() => {
			startTransition(() => {
				root.render(NamedShareApp, { ...props, page: 'b' });
			});
		});

		expect(shares).toBe(0);
		expect(exits).toBe(1);
		expect(enters).toBe(1);
	});

	it('routes a standalone Suspense reveal through startViewTransition (boundary updates)', async () => {
		let updates = 0;
		let resolve!: (v: string) => void;
		const promise = new Promise<string>((r) => {
			resolve = r;
		});
		const props = {
			promise,
			onUpdate: () => {
				updates++;
			},
		};

		// Initial mount OUTSIDE a transition: fallback shows, nothing wrapped.
		await act(() => {
			root.render(RevealApp, props);
		});
		expect(container.textContent).toBe('Loading...');
		expect(vt.calls.length).toBe(0);

		// The resolve commits the reveal via commitResume — wrapped, and the
		// boundary update-activates on the fallback → content element swap.
		await act(async () => {
			resolve('Loaded');
			await promise;
		});

		expect(container.textContent).toBe('Loaded');
		expect(vt.calls.length).toBeGreaterThan(0);
		expect(updates).toBe(1);
	});

	it('wraps a Suspense reveal that mounts the first ViewTransition boundary', async () => {
		let enters = 0;
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((r) => {
			resolve = r;
		});
		await act(() => {
			root.render(FirstBoundaryRevealApp, {
				promise,
				onEnter: () => {
					enters++;
				},
			});
		});
		expect(container.textContent).toBe('Waiting...');
		expect(vt.calls).toHaveLength(0);

		await act(async () => {
			resolve('Ready');
			await promise;
		});

		expect(container.textContent).toBe('Ready');
		expect(vt.calls.length).toBeGreaterThan(0);
		expect(enters).toBe(1);
	});

	it('routes delegated click transitions through startViewTransition, including while in flight', async () => {
		let updates = 0;
		await act(() => {
			root.render(ClickUpdateApp, {
				onUpdate: () => {
					updates++;
				},
			});
		});
		expect(vt.calls).toHaveLength(0);
		expect(container.querySelector('div')?.textContent).toBe('Short');

		// The mock's update callback is synchronous but its finished promise settles
		// in a microtask. A second immediate click therefore exercises the controller's
		// in-flight path instead of merely repeating the idle case.
		await act(async () => {
			const button = container.querySelector('button')!;
			button.click();
			button.click();
			await Promise.resolve();
		});

		expect(vt.calls).toHaveLength(2);
		expect(updates).toBe(2);
		expect(container.querySelector('div')?.textContent).toBe('Short');
	});

	it('skips an asynchronous native transition when a click touches no boundary', async () => {
		let calls = 0;
		let skips = 0;
		(document as never as Record<string, unknown>)['startViewTransition'] = (
			update: () => void,
		) => {
			calls++;
			const updated = Promise.resolve().then(update);
			return {
				ready: updated,
				finished: updated,
				skipTransition: () => {
					skips++;
				},
			};
		};

		await act(() => root.render(PlainClickApp));
		await act(async () => {
			container.querySelector('button')!.click();
			await Promise.resolve();
		});

		expect(calls).toBe(1);
		expect(skips).toBe(1);
		expect(container.querySelector('div')?.textContent).toBe('Count: 1');
	});

	it('runs the previous callback cleanup before the next activation fires', async () => {
		const log: string[] = [];
		const props = {
			text: 'One',
			onUpdate: () => {
				log.push('fire');
				return () => {
					log.push('cleanup');
				};
			},
		};
		await act(() => {
			startTransition(() => {
				root.render(CleanupApp, props);
			});
		});
		expect(log).toEqual([]);

		await act(() => {
			startTransition(() => {
				root.render(CleanupApp, { ...props, text: 'Two much longer' });
			});
		});
		expect(log).toEqual(['fire']);

		await act(() => {
			startTransition(() => {
				root.render(CleanupApp, { ...props, text: 'Three even longer still' });
			});
		});
		expect(log).toEqual(['fire', 'cleanup', 'fire']);
	});
});
