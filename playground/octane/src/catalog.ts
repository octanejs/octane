// The demo registry: the one place a demo is declared.
//
// Adding a demo means adding an entry here — the nav, the router and the source
// pane all read from this list, so none of them need to know about individual
// demos. Sources are imported with Vite's `?raw` so the Source tab shows the
// exact file on disk rather than a copy that can rot.
import { Conditional } from './demos/Conditional.tsrx';
import { Counter } from './demos/Counter.tsrx';
import { DynamicDemo } from './demos/Dynamic.tsrx';
import { Inputs } from './demos/Inputs.tsrx';
import { KeyedList } from './demos/KeyedList.tsrx';
import { ShadcnDemo } from './demos/Shadcn.tsrx';
import { SuspenseDemo } from './demos/Suspense.tsrx';

import conditionalSource from './demos/Conditional.tsrx?raw';
import counterSource from './demos/Counter.tsrx?raw';
import dynamicSource from './demos/Dynamic.tsrx?raw';
import inputsSource from './demos/Inputs.tsrx?raw';
import keyedListSource from './demos/KeyedList.tsrx?raw';
import shadcnSource from './demos/Shadcn.tsrx?raw';
import suspenseSource from './demos/Suspense.tsrx?raw';

export interface Demo {
	/** Stable id — also the URL route, so renaming one breaks shared links. */
	readonly id: string;
	readonly title: string;
	/** One line on what this demo exercises; shown in the nav. */
	readonly summary: string;
	readonly Component: () => unknown;
	readonly source: string;
}

export interface DemoGroup {
	readonly id: string;
	readonly label: string;
	readonly demos: readonly Demo[];
}

export const GROUPS: readonly DemoGroup[] = [
	{
		id: 'language',
		label: 'Language',
		demos: [
			{
				id: 'counter',
				title: 'Counter',
				summary: 'State, effects and the update form',
				Component: Counter,
				source: counterSource,
			},
			{
				id: 'keyed-list',
				title: 'Keyed list',
				summary: '@for with a key, and LIS reordering',
				Component: KeyedList,
				source: keyedListSource,
			},
			{
				id: 'conditional',
				title: 'Conditional',
				summary: '@if / @else with branch-local state',
				Component: Conditional,
				source: conditionalSource,
			},
			{
				id: 'inputs',
				title: 'Inputs + @switch',
				summary: 'Native events and controlled values',
				Component: Inputs,
				source: inputsSource,
			},
			{
				id: 'dynamic',
				title: 'Dynamic tag',
				summary: '<{expr}> picks the component at runtime',
				Component: DynamicDemo,
				source: dynamicSource,
			},
			{
				id: 'suspense',
				title: 'Suspense',
				summary: 'use() and per-stratum suspending',
				Component: SuspenseDemo,
				source: suspenseSource,
			},
		],
	},
	{
		id: 'components',
		label: 'Components',
		demos: [
			{
				id: 'shadcn',
				title: 'shadcn/ui',
				summary: 'The registry-installed component gallery',
				Component: ShadcnDemo,
				source: shadcnSource,
			},
		],
	},
];

const BY_ID = new Map(GROUPS.flatMap((group) => group.demos).map((demo) => [demo.id, demo]));

export const DEFAULT_DEMO_ID = 'counter';

/** The demo for a route, falling back to the default for an unknown or empty one. */
export function resolveDemo(route: string): Demo {
	return BY_ID.get(route) ?? BY_ID.get(DEFAULT_DEMO_ID)!;
}
