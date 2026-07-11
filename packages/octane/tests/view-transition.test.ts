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
} from './_fixtures/view-transition-features.tsrx';

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
