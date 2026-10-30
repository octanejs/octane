import { act, createElement as h, Fragment } from 'react';
import { createRoot as createReactRoot } from 'react-dom/client';
import { FileTree as FileTreeModel } from '@pierre/trees';
import * as Upstream from '@pierre/trees/react';
import { act as octaneAct, createRoot } from 'octane';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FileTree } from '../../src/index.ts';
import * as Probes from '../_fixtures/probes.tsrx';
import { BASE_OPTIONS, flushDom, installFileTreeDom, renderedPaths } from '../_dom';

// Every case drives the published @pierre/trees/react (built from the pinned
// commit) and the Octane port through the same steps and records what a caller
// can observe after each one: rendered text, the values the hooks hand back,
// host attributes, and which model owns the tree. The upstream suite does not
// exercise these paths.

type Report = (value: unknown) => void;
type Component = 'FileTree' | 'SearchProbe' | 'SelectorProbe';

const ReactComponents: Record<Component, (props: any) => unknown> = {
	FileTree: Upstream.FileTree,
	SelectorProbe(props: {
		model: FileTreeModel;
		selector: Upstream.FileTreeSelector<unknown>;
		isEqual?: Upstream.FileTreeSelectorEquality<unknown>;
		report: Report;
	}) {
		const value = Upstream.useFileTreeSelector(props.model, props.selector, props.isEqual);
		props.report(value);
		return h('span', null, JSON.stringify(value));
	},
	SearchProbe(props: { model: FileTreeModel; report: Report }) {
		const search = Upstream.useFileTreeSearch(props.model);
		props.report(search);
		return h(
			Fragment,
			null,
			h(
				'output',
				null,
				JSON.stringify({
					isOpen: search.isOpen,
					matchingPaths: search.matchingPaths,
					value: search.value,
				}),
			),
			h(Upstream.FileTree, { model: props.model }),
		);
	},
};

const OctaneComponents: Record<Component, (props: any) => unknown> = {
	FileTree,
	SelectorProbe: Probes.SelectorProbe,
	SearchProbe: Probes.SearchProbe,
};

interface Side {
	container: HTMLElement;
	render(component: Component, props: object): Promise<void>;
	/** Run `change`, then let the tree's microtasks and timers settle. */
	step(change: () => unknown): Promise<void>;
	unmount(): Promise<void>;
}

function react(): Side {
	const container = document.body.appendChild(document.createElement('div'));
	const root = createReactRoot(container);
	return {
		container,
		render: (component, props) =>
			act(async () => {
				root.render(h(ReactComponents[component] as any, props));
				await flushDom();
			}),
		step: (change) =>
			act(async () => {
				change();
				await flushDom();
			}),
		async unmount() {
			await act(async () => root.unmount());
			container.remove();
		},
	};
}

function octane(): Side {
	const container = document.body.appendChild(document.createElement('div'));
	const root = createRoot(container);
	return {
		container,
		render: (component, props) =>
			octaneAct(async () => {
				root.render(OctaneComponents[component] as any, props);
				await flushDom();
			}),
		step: (change) =>
			octaneAct(async () => {
				change();
				await flushDom();
			}),
		async unmount() {
			await octaneAct(async () => root.unmount());
			container.remove();
		},
	};
}

/** Run `scenario` on both implementations and check that Octane observes what React does. */
async function differential<T>(scenario: (create: () => Side) => Promise<T>): Promise<T> {
	const expected = await scenario(react);
	const actual = await scenario(octane);
	expect(actual).toEqual(expected);
	return expected;
}

function host(side: Side): HTMLElement {
	const element = side.container.querySelector('file-tree-container');
	if (!(element instanceof HTMLElement)) throw new Error('expected rendered file-tree host');
	return element;
}

function directory(model: FileTreeModel, path: string) {
	const item = model.getItem(path);
	if (item?.isDirectory() !== true) throw new Error(`expected directory ${path}`);
	return item;
}

const previousActEnvironment = Reflect.get(globalThis, 'IS_REACT_ACT_ENVIRONMENT');

beforeAll(() => {
	installFileTreeDom();
	Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
});

afterAll(() => {
	Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousActEnvironment);
});

describe('@pierre/trees/react differential parity', () => {
	// @parity-case differential:pierre-trees-selector-equality
	it('useFileTreeSelector keeps its previous value while isEqual holds', async () => {
		const observations = await differential(async (create) => {
			const side = create();
			const model = new FileTreeModel(BASE_OPTIONS);
			const values: unknown[] = [];
			const selector = (current: FileTreeModel) =>
				current.getSelectedPaths().map((path) => path.toUpperCase());
			const isEqual = (previous: unknown, next: unknown) =>
				JSON.stringify(previous) === JSON.stringify(next);
			const seen: { text: string; sameValue: boolean }[] = [];
			let previous: unknown;
			const observe = () => {
				const latest = values.at(-1);
				seen.push({
					text: side.container.textContent ?? '',
					sameValue: Object.is(latest, previous),
				});
				previous = latest;
			};

			await side.render('SelectorProbe', {
				model,
				selector,
				isEqual,
				report: (value: unknown) => values.push(value),
			});
			observe();
			await side.step(() => model.getItem('README.md')?.select());
			observe();
			// The model notifies, but the selection, and so the selected value, holds.
			await side.step(() => model.add('notes.md'));
			observe();
			await side.step(() => model.getItem('notes.md')?.toggleSelect());
			observe();
			await side.unmount();
			model.cleanUp();
			return seen;
		});
		expect(observations).toEqual([
			{ text: '[]', sameValue: false },
			{ text: '["README.MD"]', sameValue: false },
			{ text: '["README.MD"]', sameValue: true },
			{ text: '["README.MD","NOTES.MD"]', sameValue: false },
		]);
	});

	// @parity-case differential:pierre-trees-selector-derived
	it('useFileTreeSelector rerenders a derived value as the model changes', async () => {
		const texts = await differential(async (create) => {
			const side = create();
			const model = new FileTreeModel({ ...BASE_OPTIONS, flattenEmptyDirectories: false });
			const allExpanded = (current: FileTreeModel) => directory(current, 'src/').isExpanded();
			const seen: string[] = [];

			await side.render('SelectorProbe', { model, selector: allExpanded, report() {} });
			seen.push(side.container.textContent ?? '');
			await side.step(() => directory(model, 'src/').collapse());
			seen.push(side.container.textContent ?? '');
			await side.step(() => directory(model, 'src/').expand());
			seen.push(side.container.textContent ?? '');
			await side.unmount();
			model.cleanUp();
			return seen;
		});
		expect(texts).toEqual(['true', 'false', 'true']);
	});

	// @parity-case differential:pierre-trees-search-actions
	it('useFileTreeSearch actions drive the model and its snapshot', async () => {
		await differential(async (create) => {
			const side = create();
			const model = new FileTreeModel({ ...BASE_OPTIONS, search: true });
			let search: Upstream.FileTreeSearchState | undefined;
			const seen: { output: string; focused: string | null }[] = [];
			const observe = () =>
				seen.push({
					output: side.container.querySelector('output')?.textContent ?? '',
					focused: model.getFocusedPath(),
				});

			await side.render('SearchProbe', {
				model,
				report: (value: unknown) => {
					search = value as Upstream.FileTreeSearchState;
				},
			});
			observe();
			await side.step(() => search!.open('s'));
			observe();
			await side.step(() => search!.focusNextMatch());
			observe();
			await side.step(() => search!.focusPreviousMatch());
			observe();
			await side.step(() => search!.setValue('index'));
			observe();
			await side.step(() => search!.setValue(null));
			observe();
			await side.step(() => search!.close());
			observe();
			await side.unmount();
			model.cleanUp();
			return seen;
		});
	});

	// @parity-case differential:pierre-trees-host-props
	it('FileTree passes host props through, merges style, and falls back to the preloaded id', async () => {
		await differential(async (create) => {
			const side = create();
			const model = new FileTreeModel(BASE_OPTIONS);
			const observe = () => {
				const element = host(side);
				return {
					attributes: [...element.attributes]
						.filter((attribute) => attribute.name !== 'style')
						.map((attribute) => `${attribute.name}=${attribute.value}`)
						.sort(),
					style: ['color', '--trees-item-height', '--trees-density-override'].map((name) =>
						element.style.getPropertyValue(name),
					),
					paths: renderedPaths(element),
				};
			};

			await side.render('FileTree', {
				model,
				className: 'tree',
				'aria-label': 'Files',
				'data-kind': 'diff',
				preloadedData: { id: 'preloaded-id', shadowHtml: '' },
				style: { color: 'red', '--trees-item-height': '40px' },
			});
			const first = observe();
			// className changes rather than goes away: React 19 writes class="undefined"
			// when a custom element loses it, where Octane removes the attribute.
			await side.render('FileTree', {
				model,
				className: 'tree wide',
				id: 'explicit-id',
				title: 'Tree',
			});
			const second = observe();
			await side.unmount();
			model.cleanUp();
			return [first, second];
		});
	});

	// @parity-case differential:pierre-trees-model-swap
	it('FileTree moves the tree to a new model and unmounts the old one', async () => {
		await differential(async (create) => {
			const side = create();
			const first = new FileTreeModel(BASE_OPTIONS);
			const second = new FileTreeModel({ ...BASE_OPTIONS, paths: ['docs/guide.md'] });

			await side.render('FileTree', { model: first });
			const before = {
				paths: renderedPaths(host(side)),
				firstOwnsHost: first.getFileTreeContainer() === host(side),
			};
			await side.render('FileTree', { model: second });
			const after = {
				paths: renderedPaths(host(side)),
				firstOwnsHost: first.getFileTreeContainer() === host(side),
				secondOwnsHost: second.getFileTreeContainer() === host(side),
			};
			await side.unmount();
			first.cleanUp();
			second.cleanUp();
			return { before, after };
		});
	});

	// @parity-case differential:pierre-trees-host-events
	it('host click handlers see clicks on rows inside the shadow root', async () => {
		await differential(async (create) => {
			const side = create();
			const model = new FileTreeModel(BASE_OPTIONS);
			const log: string[] = [];
			const record = (phase: string) => (event: Event) =>
				log.push(
					`${phase}:${event.type}:${String(event.currentTarget === host(side))}:${String(
						event.target === host(side),
					)}`,
				);

			await side.render('FileTree', {
				model,
				onClick: record('bubble'),
				onClickCapture: record('capture'),
			});
			const row = host(side).shadowRoot?.querySelector('[data-item-path="README.md"]');
			await side.step(() =>
				row?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true })),
			);
			const selected = [...model.getSelectedPaths()];
			await side.unmount();
			model.cleanUp();
			return { log, selected };
		});
	});
});
