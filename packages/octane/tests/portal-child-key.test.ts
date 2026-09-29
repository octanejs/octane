import { describe, it, expect } from 'vitest';
import { createElement, createPortal, createRoot, flushSync } from '../src/index.js';
import * as React from 'react';
import { createPortal as createReactPortal, flushSync as flushReact } from 'react-dom';
import { createRoot as createReactRoot } from 'react-dom/client';
import {
	DirectKeyedChild,
	DirectSwitchedChild,
	ReturnKeyedChild,
	ReturnKeyedHostChild,
	ReturnSwitchedChild,
} from './_fixtures/portal-child-key.tsrx';

// Issue #1342: the key (and type) of the element passed to createPortal is the
// child's identity, independent of the portal's own third-argument key. React
// remounts the child when either changes; the portal key stays React's
// separate portal identity (#943).

type Outcome = 'kept' | 'fresh' | `unexpected: ${string}`;
type Api = {
	h: (type: any, props?: any, ...children: any[]) => any;
	portal: (children: any, target: Element, key?: string) => any;
};
type Scenario = (api: Api, target: Element) => (props: any) => any;

const octaneApi: Api = { h: createElement, portal: createPortal as Api['portal'] };
const reactApi: Api = {
	h: React.createElement as Api['h'],
	portal: createReactPortal as Api['portal'],
};

/**
 * Render each step, typing into the portal's input between steps, and report
 * whether each re-render kept the typed input or replaced it with a fresh one.
 */
function outcomes(render: (props: any) => void, target: Element, steps: readonly any[]): Outcome[] {
	const result: Outcome[] = [];
	render(steps[0]);
	let previous = target.querySelector('input')!;
	for (const step of steps.slice(1)) {
		const initial = previous.defaultValue;
		previous.value = 'typed';
		render(step);
		const next = target.querySelector('input')!;
		if (next === previous && next.value === 'typed') result.push('kept');
		else if (
			next !== previous &&
			previous.isConnected === false &&
			next.value === next.defaultValue
		)
			result.push('fresh');
		else
			result.push(`unexpected: same=${next === previous} value=${next.value} initial=${initial}`);
		previous = next;
	}
	return result;
}

function withTarget<T>(fn: (container: HTMLElement, target: HTMLElement) => T): T {
	const container = document.createElement('div');
	const target = document.createElement('div');
	document.body.append(container, target);
	try {
		return fn(container, target);
	} finally {
		container.remove();
		target.remove();
	}
}

function runOctane(scenario: Scenario, steps: readonly any[]): Outcome[] {
	return withTarget((container, target) => {
		const App = scenario(octaneApi, target);
		const root = createRoot(container);
		try {
			return outcomes((props) => flushSync(() => root.render(App, props)), target, steps);
		} finally {
			root.unmount();
		}
	});
}

function runReact(scenario: Scenario, steps: readonly any[]): Outcome[] {
	return withTarget((container, target) => {
		const App = scenario(reactApi, target);
		const root = createReactRoot(container);
		try {
			return outcomes(
				(props) => flushReact(() => root.render(React.createElement(App, props))),
				target,
				steps,
			);
		} finally {
			flushReact(() => root.unmount());
		}
	});
}

function field(api: Api, className = 'field', defaultValue = 'fresh') {
	return () => api.h('input', { className, defaultValue });
}

const keyedChild: Scenario = (api, target) => {
	const Field = field(api);
	return ({ id, portalKey = 'stable' }) => api.portal(api.h(Field, { key: id }), target, portalKey);
};

const keyedHostChild: Scenario =
	(api, target) =>
	({ id }) =>
		api.portal(
			api.h('input', { key: id, className: 'field', defaultValue: 'fresh' }),
			target,
			'stable',
		);

const switchedChild: Scenario = (api, target) => {
	const Field = field(api);
	const OtherField = field(api, 'field other', 'other');
	return ({ other }) => api.portal(api.h(other ? OtherField : Field, null), target, 'stable');
};

const optionallyKeyedChild: Scenario = (api, target) => {
	const Field = field(api);
	return ({ id }) =>
		api.portal(api.h(Field, id === undefined ? null : { key: id }), target, 'stable');
};

const hostOrComponentChild: Scenario = (api, target) => {
	const Field = field(api);
	return ({ host }) =>
		api.portal(
			host ? api.h('input', { className: 'field', defaultValue: 'fresh' }) : api.h(Field, null),
			target,
			'stable',
		);
};

const cases: Array<[name: string, scenario: Scenario, steps: any[], expected: Outcome[]]> = [
	[
		'remounts a keyed component child when its key changes',
		keyedChild,
		[{ id: 'a' }, { id: 'a' }, { id: 'b' }, { id: 'b' }],
		['kept', 'fresh', 'kept'],
	],
	[
		'remounts when the portal key and the child key change together',
		keyedChild,
		[
			{ id: 'a', portalKey: 'p' },
			{ id: 'b', portalKey: 'q' },
		],
		['fresh'],
	],
	[
		'still remounts when only the portal key changes',
		keyedChild,
		[
			{ id: 'a', portalKey: 'p' },
			{ id: 'a', portalKey: 'p' },
			{ id: 'a', portalKey: 'q' },
		],
		['kept', 'fresh'],
	],
	[
		'remounts a keyed host child when its key changes',
		keyedHostChild,
		[{ id: 'a' }, { id: 'a' }, { id: 'b' }],
		['kept', 'fresh'],
	],
	[
		'remounts when the component type changes',
		switchedChild,
		[{ other: false }, { other: false }, { other: true }, { other: true }, { other: false }],
		['kept', 'fresh', 'kept', 'fresh'],
	],
	[
		'remounts when a component child gains or loses a key',
		optionallyKeyedChild,
		[{}, {}, { id: 'a' }, { id: 'a' }, {}],
		['kept', 'fresh', 'kept', 'fresh'],
	],
	[
		'remounts when the child switches between a host element and a component',
		hostOrComponentChild,
		[{ host: true }, { host: true }, { host: false }, { host: false }, { host: true }],
		['kept', 'fresh', 'kept', 'fresh'],
	],
];

describe('createPortal child identity (#1342)', () => {
	describe('createElement descriptors', () => {
		it.each(cases)('%s', (_name, scenario, steps, expected) => {
			expect(runOctane(scenario, steps)).toEqual(expected);
		});
	});

	it('keeps a render-function body whose identity changes every render', () => {
		const inlineBody: Scenario = (api, target) => {
			const Field = field(api);
			return () => api.portal(() => api.h(Field, null), target, 'stable');
		};
		expect(runOctane(inlineBody, [{}, {}, {}])).toEqual(['kept', 'kept']);
	});

	describe('React 19 control', () => {
		it.each(cases)('%s', (_name, scenario, steps, expected) => {
			expect(runReact(scenario, steps)).toEqual(expected);
		});
	});

	describe('compiled .tsrx', () => {
		const compiled: Array<[name: string, App: any, steps: any[], expected: Outcome[]]> = [
			[
				'a returned portal remounts a keyed component child',
				ReturnKeyedChild,
				[{ id: 'a' }, { id: 'a' }, { id: 'b' }, { id: 'b', portalKey: 'next' }],
				['kept', 'fresh', 'fresh'],
			],
			[
				'a direct child-position portal remounts a keyed component child',
				DirectKeyedChild,
				[{ id: 'a' }, { id: 'a' }, { id: 'b' }, { id: 'b', portalKey: 'next' }],
				['kept', 'fresh', 'fresh'],
			],
			[
				'a returned portal remounts when the component type changes',
				ReturnSwitchedChild,
				[{ other: false }, { other: false }, { other: true }, { other: false }],
				['kept', 'fresh', 'fresh'],
			],
			[
				'a direct child-position portal remounts when the component type changes',
				DirectSwitchedChild,
				[{ other: false }, { other: false }, { other: true }, { other: false }],
				['kept', 'fresh', 'fresh'],
			],
			[
				'a returned portal remounts a keyed host child',
				ReturnKeyedHostChild,
				[{ id: 'a' }, { id: 'a' }, { id: 'b' }],
				['kept', 'fresh'],
			],
		];
		it.each(compiled)('%s', (_name, App, steps, expected) => {
			const result = withTarget((container, target) => {
				const root = createRoot(container);
				try {
					return outcomes(
						(props) => flushSync(() => root.render(App, { target, ...props })),
						target,
						steps,
					);
				} finally {
					root.unmount();
				}
			});
			expect(result).toEqual(expected);
		});
	});
});
