import { LegendList as ReactLegendList } from '@legendapp/list/react';
import { createElement, renderToString } from 'octane/server';
import { createElement as createReactElement } from 'react';
import { renderToString as renderReactToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LegendList } from '../../src/react.ts';

// Server rendering parity: the same props render through octane/server and through
// @legendapp/list/react on react-dom/server. Rows need a client layout pass, so both
// emit the scroll shell, header, footer, empty state and snap anchors.
type Create = (type: any, props?: any, ...children: any[]) => any;
interface Row {
	id: string;
	label: string;
}
const data: Row[] = Array.from({ length: 30 }, (_, index) => ({
	id: `r${index}`,
	label: `Row ${index}`,
}));

function scenarios(h: Create) {
	const renderItem = ({ item }: { item: Row }) => h('div', { 'data-row': item.id }, item.label);
	const base = {
		data,
		estimatedItemSize: 50,
		keyExtractor: (row: Row) => row.id,
		renderItem,
		style: { height: 400 },
	};
	return {
		basic: base,
		chrome: {
			...base,
			className: 'timeline',
			contentContainerClassName: 'lane',
			ListFooterComponent: h('div', { 'data-footer': '' }, 'Footer'),
			ListHeaderComponent: () => h('div', { 'data-header': '' }, 'Header'),
		},
		chat: {
			...base,
			initialScrollAtEnd: true,
			maintainScrollAtEnd: { animated: false, on: { dataChange: true } },
			maintainVisibleContentPosition: { data: true, size: true },
		},
		empty: { ...base, data: [], ListEmptyComponent: h('p', null, 'Nothing yet') },
		horizontal: { ...base, horizontal: true, style: { height: 80, width: 320 } },
		snap: { ...base, showsVerticalScrollIndicator: false, snapToIndices: [0, 10] },
	};
}

// Octane's hydration comments are not React's, and its server style serializer ends
// every declaration with `;` where React's omits the last one. Neither is list output.
function normalize(html: string) {
	return html.replace(/<!--[\s\S]*?-->/g, '').replace(/;"/g, '"');
}

describe('LegendList server rendering', () => {
	// @parity-case differential:legendapp-list-ssr
	it('matches @legendapp/list/react for every props scenario', () => {
		const react = scenarios(createReactElement);
		const octane = scenarios(createElement as Create);
		for (const name of Object.keys(react) as (keyof typeof react)[]) {
			const expected = renderReactToString(createReactElement(ReactLegendList as any, react[name]));
			const actual = renderToString(createElement(LegendList as any, octane[name])).html;
			expect(normalize(actual), name).toBe(expected);
		}
	});
});
