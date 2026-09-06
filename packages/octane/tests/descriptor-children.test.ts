import { describe, expect, it, vi } from 'vitest';
import { hydrateRoot } from 'octane';
import { mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import { renderToStaticMarkup, renderToString } from 'octane/server';
import {
	DescriptorChildrenApp,
	DescriptorChildrenDirectiveApp,
	descriptorIsElement,
} from './_fixtures/descriptor-children.tsrx';
import {
	Ordinary,
	MarkedChildren,
	ParameterShadowedChildren,
	BlockShadowedChildren,
	ScopedShadowedChildren,
	LoopShadowedChildren,
	LoopMarkedChildren,
} from './_fixtures/descriptor-children-shadowing.tsrx';

const shadowedServer = loadServerFixture(
	'packages/octane/tests/_fixtures/descriptor-children-shadowing.tsrx',
);

function kindOf(component: (...args: any[]) => unknown, props?: unknown): string | undefined {
	const mounted = mount(component, props);
	try {
		return mounted.find('span').getAttribute('data-children-kind') ?? undefined;
	} finally {
		mounted.unmount();
	}
}

describe('descriptorChildren', () => {
	it('recognizes marked call sites and preserves the ordinary semantics of shadowed tags', () => {
		expect(kindOf(MarkedChildren)).toBe('descriptor');
		expect(kindOf(ParameterShadowedChildren, Ordinary)).toBe('block');
		expect(kindOf(BlockShadowedChildren, { ordinary: true })).toBe('block');
		expect(kindOf(BlockShadowedChildren, { ordinary: false })).toBe('descriptor');
		expect(kindOf(ScopedShadowedChildren, Ordinary)).toBe('block');
		expect(kindOf(LoopMarkedChildren)).toBe('descriptor');
		const loop = mount(LoopShadowedChildren);
		try {
			expect(
				Array.from(loop.container.querySelectorAll('[data-children-kind]')).map((node) =>
					node.getAttribute('data-children-kind'),
				),
			).toEqual(['block', 'descriptor']);
		} finally {
			loop.unmount();
		}
		for (const [component, props, expected] of [
			[shadowedServer.MarkedChildren, undefined, 'descriptor'],
			[shadowedServer.ParameterShadowedChildren, shadowedServer.Ordinary, 'block'],
			[shadowedServer.BlockShadowedChildren, { ordinary: true }, 'block'],
			[shadowedServer.BlockShadowedChildren, { ordinary: false }, 'descriptor'],
			[shadowedServer.ScopedShadowedChildren, shadowedServer.Ordinary, 'block'],
		] as const) {
			expect(renderToStaticMarkup(component, props).html).toContain(
				`data-children-kind="${expected}"`,
			);
		}
		const loopHtml = renderToStaticMarkup(shadowedServer.LoopShadowedChildren).html;
		expect(
			Array.from(loopHtml.matchAll(/data-children-kind="([^"]+)"/g), (match) => match[1]),
		).toEqual(['block', 'descriptor']);
		expect(renderToStaticMarkup(shadowedServer.LoopMarkedChildren).html).toContain(
			'data-children-kind="descriptor"',
		);
	});

	it('hydrates an ordinary shadowed call while adopting its server nodes', () => {
		const html = renderToString(
			shadowedServer.ParameterShadowedChildren,
			shadowedServer.Ordinary,
		).html;
		expect(html).toContain('data-children-kind="block"');
		const container = document.createElement('div');
		container.innerHTML = html;
		const serverNode = container.querySelector('span');
		const root = hydrateRoot(container, ParameterShadowedChildren, Ordinary);
		try {
			expect(container.querySelector('span')).toBe(serverNode);
			expect(serverNode?.getAttribute('data-children-kind')).toBe('block');
		} finally {
			root.unmount();
		}
	});
	it('lets a component inspect and clone one ordinary template child without a wrapper', () => {
		const inspect = vi.fn();
		const onClick = vi.fn();
		const ref = { current: null as HTMLButtonElement | null };
		const mounted = mount(DescriptorChildrenApp, { inspect, onClick, ref });

		expect(inspect).toHaveBeenCalledTimes(1);
		expect(descriptorIsElement(inspect.mock.calls[0][0])).toBe(true);
		expect(mounted.findAll('button')).toHaveLength(1);
		expect(mounted.html()).toContain('class="original cloned"');
		expect(ref.current).toBe(mounted.find('button'));
		mounted.click('button');
		expect(onClick).toHaveBeenCalledTimes(1);
		mounted.unmount();
	});

	it('keeps @if children under a marked call inspectable and renderable', () => {
		const inspect = vi.fn();
		const shown = mount(DescriptorChildrenDirectiveApp, { show: true, inspect });

		expect(inspect).toHaveBeenCalledTimes(1);
		expect(descriptorIsElement(inspect.mock.calls[0][0])).toBe(true);
		expect(shown.findAll('button.gated')).toHaveLength(1);
		shown.unmount();

		inspect.mockClear();
		const hidden = mount(DescriptorChildrenDirectiveApp, { show: false, inspect });
		expect(inspect).toHaveBeenCalledTimes(1);
		expect(descriptorIsElement(inspect.mock.calls[0][0])).toBe(true);
		expect(hidden.findAll('button.gated')).toHaveLength(0);
		hidden.unmount();
	});
});
