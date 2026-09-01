import { describe, it, expect } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { mount, flushEffects, act, nextPaint, type MountResult } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture';
import {
	WideTrio,
	WidePanels,
	TrailingPanel,
	ChainTrio,
	TransitiveTrio,
	MultiHopTransitiveTrio,
	Pair,
	Tree,
	KeyedPair,
	TransitionPair,
	FragmentTrio,
	SuspendingPair,
} from './_fixtures/component-children-host.tsrx';

const SWITCH_CHILD_SOURCE = `
	import { useState } from 'octane';

	function SwitchLeaf(props) @{
		<span class="switch-leaf">{props.label as string}</span>
	}

	function SwitchPanel(props) @{
		const [count, setCount] = useState(0);
		@switch (props.kind) {
			@case 'large': {
				<button class="switch-large" onClick={() => setCount(count + 1)}>
					{props.label + ':' + count as string}
				</button>
			}
			@case 'middle': {
				<strong class="switch-middle">{props.label as string}</strong>
			}
			@default: {
				<SwitchLeaf label={props.label} />
			}
		}
	}

	export function SwitchPair(props) @{
		<section class="switch-host">
			<SwitchPanel kind={props.first} label="A" />
			<SwitchPanel kind={props.second} label="B" />
		</section>
	}

	function HooklessSwitchPanel(props) @{
		@switch (props.kind) {
			@case 'large': {
				<strong class="switch-middle">{props.label as string}</strong>
			}
			@default: {
				<SwitchLeaf label={props.label} />
			}
		}
	}

	export function HooklessSwitchPair(props) @{
		<section class="switch-host">
			<HooklessSwitchPanel kind={props.first} label="A" />
			<HooklessSwitchPanel kind={props.second} label="B" />
		</section>
	}

	function OptionalSwitchPanel(props) @{
		@switch (props.kind) {
			@case 'large': {
				<strong class="switch-middle">{props.label as string}</strong>
			}
		}
	}

	export function OptionalSwitchPair(props) @{
		<section class="switch-host">
			<OptionalSwitchPanel kind={props.first} label="A" />
			<SwitchLeaf label="B" />
		</section>
	}

	function ShadowedOptional(props) @{
		@if (props.visible) {
			<strong class="switch-middle">{props.label as string}</strong>
		}
	}

	function ShadowedSwitchPanel(props) @{
		@switch (props.kind) {
			@case 'shadow': {
				const SwitchLeaf = props.component;
				<SwitchLeaf label={props.label} visible={props.visible} />
			}
			@default: {
				<strong class="switch-middle">{props.label as string}</strong>
			}
		}
	}

	export function ShadowedSwitchPair(props) @{
		<section class="switch-host">
			<ShadowedSwitchPanel
				kind="shadow"
				component={ShadowedOptional}
				visible={props.visible}
				label="A"
			/>
			<SwitchLeaf label="B" />
		</section>
	}

	function NestedShadowedSwitchPanel(props) @{
		@switch (props.kind) {
			@case 'shadow': {
				@if (props.nested) {
					const SwitchLeaf = props.component;
					<SwitchLeaf label={props.label} visible={props.visible} />
				} @else {
					<strong class="switch-middle">{props.label as string}</strong>
				}
			}
			@default: {
				<strong class="switch-middle">{props.label as string}</strong>
			}
		}
	}

	export function NestedShadowedSwitchPair(props) @{
		<section class="switch-host">
			<NestedShadowedSwitchPanel
				kind="shadow"
				nested={true}
				component={ShadowedOptional}
				visible={props.visible}
				label="A"
			/>
			<SwitchLeaf label="B" />
		</section>
	}

	function WideSwitchPanel(props) @{
		@switch (props.kind) {
			@case 'large': {
				<>
					<strong class="switch-middle">{props.label as string}</strong>
					<em class="switch-tail">{props.label as string}</em>
				</>
			}
			@default: {
				<SwitchLeaf label={props.label} />
			}
		}
	}

	export function WideSwitchPair(props) @{
		<section class="switch-host">
			<WideSwitchPanel kind={props.first} label="A" />
			<SwitchLeaf label="B" />
		</section>
	}
`;

function loadSwitchChildren(mode: 'client' | 'server') {
	return loadCompiledFixtureSource(SWITCH_CHILD_SOURCE, {
		id: 'switch-component-children.tsrx',
		mode,
		compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
	});
}

// A host element whose children are ALL components mounts each child slot in
// source order. The contract pinned here is sibling ORDER: a component child
// that renders nothing at mount and produces content on a later render must
// still place that content at its own source position — ahead of every later
// sibling's content — and keep doing so across repeated toggles.
//
// Assertions read element order (`children`) and textContent, never raw
// innerHTML: the dev and prod compiles legitimately differ in comment markers.

const order = (r: MountResult) =>
	[...r.find('section.host').children].map((el) => `${el.className}:${el.textContent}`);

describe('all-component-children host sibling order', () => {
	it('children that start with content mount in source order', () => {
		const r = mount(WidePanels, { aBig: true, bBig: true });
		expect(order(r)).toEqual(['big:A', 'big:B', 'leaf:C']);
		r.unmount();
	});

	it('a panel that mounts EMPTY renders before its later sibling once it appears', () => {
		const r = mount(WideTrio, { bBig: false });
		expect(order(r)).toEqual(['leaf:C']);

		r.update(WideTrio, { bBig: true });
		expect(order(r)).toEqual(['big:B', 'leaf:C']);

		// And the order survives toggling away and back.
		r.update(WideTrio, { bBig: false });
		expect(order(r)).toEqual(['leaf:C']);
		r.update(WideTrio, { bBig: true });
		expect(order(r)).toEqual(['big:B', 'leaf:C']);
		r.unmount();
	});

	it('two empty-mounted panels interleave in source order regardless of toggle order', () => {
		// B appears first, then A — A must still land ahead of B.
		const r = mount(WidePanels, { aBig: false, bBig: false });
		expect(order(r)).toEqual(['leaf:C']);

		r.update(WidePanels, { aBig: false, bBig: true });
		expect(order(r)).toEqual(['big:B', 'leaf:C']);

		r.update(WidePanels, { aBig: true, bBig: true });
		expect(order(r)).toEqual(['big:A', 'big:B', 'leaf:C']);

		r.update(WidePanels, { aBig: false, bBig: true });
		expect(order(r)).toEqual(['big:B', 'leaf:C']);

		r.update(WidePanels, { aBig: true, bBig: true });
		expect(order(r)).toEqual(['big:A', 'big:B', 'leaf:C']);
		r.unmount();
	});

	it('a full @if/@else chain child keeps its place across branch swaps', () => {
		const r = mount(ChainTrio, { aBig: false });
		expect(order(r)).toEqual(['small:A', 'leaf:C']);

		r.update(ChainTrio, { aBig: true });
		expect(order(r)).toEqual(['big:A', 'leaf:C']);
		r.update(ChainTrio, { aBig: false });
		expect(order(r)).toEqual(['small:A', 'leaf:C']);
		r.unmount();
	});

	it('an empty mount reached through a chain child still inserts in source order', () => {
		// The may-render-nothing panel sits INSIDE a full-chain arm, so the
		// hazard is only visible transitively through the chain component.
		const r = mount(TransitiveTrio, { bBig: false });
		expect(order(r)).toEqual(['leaf:C']);

		r.update(TransitiveTrio, { bBig: true });
		expect(order(r)).toEqual(['big:B', 'leaf:C']);
		r.update(TransitiveTrio, { bBig: false });
		expect(order(r)).toEqual(['leaf:C']);
		r.update(TransitiveTrio, { bBig: true });
		expect(order(r)).toEqual(['big:B', 'leaf:C']);
		r.unmount();
	});

	it('a multi-hop empty leaf repeatedly reappears before its later sibling', () => {
		const r = mount(MultiHopTransitiveTrio, { bBig: false });
		expect(order(r)).toEqual(['leaf:C']);

		r.update(MultiHopTransitiveTrio, { bBig: true });
		expect(order(r)).toEqual(['big:B', 'leaf:C']);
		r.update(MultiHopTransitiveTrio, { bBig: false });
		expect(order(r)).toEqual(['leaf:C']);
		r.update(MultiHopTransitiveTrio, { bBig: true });
		expect(order(r)).toEqual(['big:B', 'leaf:C']);
		r.unmount();
	});

	it('a trailing panel that mounts empty appears after its earlier sibling', () => {
		const r = mount(TrailingPanel, { zBig: false });
		expect(order(r)).toEqual(['leaf:A']);

		r.update(TrailingPanel, { zBig: true });
		expect(order(r)).toEqual(['leaf:A', 'big:Z']);

		r.update(TrailingPanel, { zBig: false });
		expect(order(r)).toEqual(['leaf:A']);
		r.update(TrailingPanel, { zBig: true });
		expect(order(r)).toEqual(['leaf:A', 'big:Z']);
		r.unmount();
	});
});

// Children whose @if/@else bodies are proven single-root transitively (host or
// component arms) mount with no minted markers. The contract: source order, an
// arm flip in one child never disturbs a sibling's DOM identity or state,
// component-local state survives its own flip, and teardown leaves nothing
// behind. These hold in every marker regime, so the assertions strip comments
// the same way mixed-child-order.test.ts does.
function stripComments(html: string): string {
	return html.replace(/<!--[\s\S]*?-->/g, '');
}

describe('host with only component children (@if-root components)', () => {
	it('mounts both children in source order', () => {
		const m = mount(Pair, { aBig: true, bBig: false });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><div class="big">A:0</div><span class="leaf">B</span></section>',
		);
		m.unmount();
	});

	it('flipping the FIRST child keeps order and the second child’s DOM node', () => {
		const m = mount(Pair, { aBig: true, bBig: true });
		flushEffects();
		const b = m.findAll('.big')[1];
		m.update(Pair, { aBig: false, bBig: true });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><span class="leaf">A</span><div class="big">B:0</div></section>',
		);
		// The sibling was not remounted or moved.
		expect(m.findAll('.big')[0]).toBe(b);
		m.unmount();
	});

	it('flipping the LAST child keeps order and the first child’s DOM node', () => {
		const m = mount(Pair, { aBig: true, bBig: true });
		flushEffects();
		const a = m.findAll('.big')[0];
		m.update(Pair, { aBig: true, bBig: false });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><div class="big">A:0</div><span class="leaf">B</span></section>',
		);
		expect(m.findAll('.big')[0]).toBe(a);
		m.unmount();
	});

	it('component-local state survives its own arm round trip; sibling state untouched', () => {
		const m = mount(Pair, { aBig: true, bBig: true });
		flushEffects();
		// Bump A's counter, then flip A's arm away and back.
		m.click('.big'); // first .big is A
		expect(stripComments(m.html())).toContain('A:1');
		const b = m.findAll('.big')[1];
		m.update(Pair, { aBig: false, bBig: true });
		flushEffects();
		m.update(Pair, { aBig: true, bBig: true });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><div class="big">A:1</div><div class="big">B:0</div></section>',
		);
		expect(m.findAll('.big')[1]).toBe(b);
		// The re-rendered arm's handler is live.
		m.click('.big');
		expect(stripComments(m.html())).toContain('A:2');
		m.unmount();
	});

	it('repeated flips of both children converge to the right DOM', () => {
		const m = mount(Pair, { aBig: true, bBig: false });
		flushEffects();
		for (let i = 0; i < 3; i++) {
			m.update(Pair, { aBig: false, bBig: true });
			flushEffects();
			expect(stripComments(m.html())).toBe(
				'<section class="host"><span class="leaf">A</span><div class="big">B:0</div></section>',
			);
			m.update(Pair, { aBig: true, bBig: false });
			flushEffects();
			expect(stripComments(m.html())).toBe(
				'<section class="host"><div class="big">A:0</div><span class="leaf">B</span></section>',
			);
		}
		m.unmount();
	});

	it('recursive tree mounts every leaf in order and tears down empty', () => {
		const m = mount(Tree, { depth: 3, path: 'r' });
		flushEffects();
		const leaves = m.findAll('.leaf').map((el) => el.textContent);
		expect(leaves).toEqual(['rLLL', 'rLLR', 'rLRL', 'rLRR', 'rRLL', 'rRLR', 'rRRL', 'rRRR']);
		expect(m.findAll('.n').length).toBe(7);
		m.root.unmount();
		expect(m.container.innerHTML).toBe('');
		m.container.remove();
	});

	it('growing the tree flips leaf arms into interior nodes in place', () => {
		const m = mount(Tree, { depth: 1, path: 'r' });
		flushEffects();
		expect(m.findAll('.leaf').map((el) => el.textContent)).toEqual(['rL', 'rR']);
		const root = m.find('.n');
		m.update(Tree, { depth: 2, path: 'r' });
		flushEffects();
		expect(m.findAll('.leaf').map((el) => el.textContent)).toEqual(['rLL', 'rLR', 'rRL', 'rRR']);
		// The root interior node survives; only the child arms flipped.
		expect(m.find('.n')).toBe(root);
		m.update(Tree, { depth: 1, path: 'r' });
		flushEffects();
		expect(m.findAll('.leaf').map((el) => el.textContent)).toEqual(['rL', 'rR']);
		expect(m.find('.n')).toBe(root);
		m.root.unmount();
		expect(m.container.innerHTML).toBe('');
		m.container.remove();
	});

	it('a keyed component child still remounts on key change; unkeyed sibling node survives', () => {
		const m = mount(KeyedPair, { k: 1 });
		flushEffects();
		m.click('.c');
		expect(stripComments(m.html())).toContain('A:1');
		const leaf = m.find('.leaf');
		m.update(KeyedPair, { k: 2 });
		flushEffects();
		// Key change reset the counter state…
		expect(stripComments(m.html())).toContain('A:0');
		// …without touching the sibling.
		expect(m.find('.leaf')).toBe(leaf);
		m.unmount();
	});

	it('children that can render zero or two roots keep order/identity through flips', () => {
		// WidePanel's arm is a fragment (two DOM roots) and MaybePanel has no
		// @else (can render nothing), so neither can self-delimit — the contract
		// must hold however their slots are bounded. This is the shape an
		// over-widened single-root proof corrupts. (The empty-MOUNT ordering
		// cases live in the describe above.)
		const m = mount(FragmentTrio, { aBig: true, bBig: true });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><div class="big">A</div><em class="tail">A</em><div class="big">B</div><span class="leaf">C</span></section>',
		);
		const c = m.find('.leaf');
		// B collapses to empty; A and C keep their nodes.
		const aTail = m.find('.tail');
		m.update(FragmentTrio, { aBig: true, bBig: false });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><div class="big">A</div><em class="tail">A</em><span class="leaf">C</span></section>',
		);
		expect(m.find('.tail')).toBe(aTail);
		expect(m.find('.leaf')).toBe(c);
		// B returns to its slot BETWEEN A's tail and C.
		m.update(FragmentTrio, { aBig: true, bBig: true });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><div class="big">A</div><em class="tail">A</em><div class="big">B</div><span class="leaf">C</span></section>',
		);
		expect(m.find('.leaf')).toBe(c);
		// A collapses to a single leaf; B stays put.
		m.update(FragmentTrio, { aBig: false, bBig: true });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><span class="leaf">A</span><div class="big">B</div><span class="leaf">C</span></section>',
		);
		// And back to the wide arm.
		m.update(FragmentTrio, { aBig: true, bBig: true });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><div class="big">A</div><em class="tail">A</em><div class="big">B</div><span class="leaf">C</span></section>',
		);
		m.root.unmount();
		expect(m.container.innerHTML).toBe('');
		m.container.remove();
	});

	it('a suspending child falls back and resolves into source order beside its sibling', async () => {
		let resolve!: (v: string) => void;
		const p = new Promise<string>((res) => {
			resolve = res;
		});
		const m = mount(SuspendingPair, { p });
		// Suspended before inserting content: the fallback shows and no child
		// content has landed in the (off-screen) host.
		expect(m.findAll('.fb').length).toBe(1);
		expect(m.findAll('.big').length).toBe(0);
		await act(() => resolve('A'));
		expect(m.findAll('.fb').length).toBe(0);
		expect(stripComments(m.find('.host').innerHTML)).toBe(
			'<div class="big">A</div><div class="big">B:0</div>',
		);
		// The resolved sibling is interactive.
		m.click('.host .big:nth-child(2)');
		expect(stripComments(m.find('.host').innerHTML)).toBe(
			'<div class="big">A</div><div class="big">B:1</div>',
		);
		m.root.unmount();
		expect(m.container.innerHTML).toBe('');
		m.container.remove();
	});

	it('a transition-driven arm flip keeps the sibling’s DOM node', async () => {
		const m = mount(TransitionPair);
		flushEffects();
		const b = m.findAll('.big')[1];
		await act(async () => {
			m.click('.flip');
		});
		expect(stripComments(m.find('.host').innerHTML)).toBe(
			'<span class="leaf">A</span><div class="big">B:0</div>',
		);
		expect(m.findAll('.big')[0]).toBe(b);
		await act(async () => {
			m.click('.flip');
		});
		expect(stripComments(m.find('.host').innerHTML)).toBe(
			'<div class="big">A:0</div><div class="big">B:0</div>',
		);
		expect(m.findAll('.big')[1]).toBe(b);
		m.unmount();
	});
});

describe('host with only component children (@switch-root components)', () => {
	it('exposes each complete stateful switch child as the host’s actual first and last child', () => {
		const client = loadSwitchChildren('client');
		const root = mount(client.SwitchPair, { first: 'large', second: 'other' });

		try {
			const host = root.find('.switch-host');
			const first = root.find('.switch-large');
			const second = root.find('.switch-leaf');

			expect(host.firstChild).toBe(first);
			expect(host.lastChild).toBe(second);
			expect(host.textContent).toBe('A:0B');
		} finally {
			root.unmount();
		}
	});

	it('exposes complete hookless switch children in source order', () => {
		const client = loadSwitchChildren('client');
		const root = mount(client.HooklessSwitchPair, { first: 'large', second: 'other' });

		try {
			const host = root.find('.switch-host');
			const first = root.find('.switch-middle');
			const second = root.find('.switch-leaf');

			expect(host.firstChild).toBe(first);
			expect(host.lastChild).toBe(second);
			expect(Array.from(host.children)).toEqual([first, second]);
		} finally {
			root.unmount();
		}
	});

	it('preserves switch-child state and its sibling’s identity across every case', () => {
		const client = loadSwitchChildren('client');
		const root = mount(client.SwitchPair, { first: 'large', second: 'other' });

		try {
			const sibling = root.find('.switch-leaf');
			root.click('.switch-large');
			expect(root.find('.switch-large').textContent).toBe('A:1');

			root.update(client.SwitchPair, { first: 'middle', second: 'other' });
			expect(root.find('.switch-host').textContent).toBe('AB');
			expect(root.find('.switch-leaf')).toBe(sibling);

			root.update(client.SwitchPair, { first: 'other', second: 'other' });
			expect(root.findAll('.switch-leaf').map((node) => node.textContent)).toEqual(['A', 'B']);
			expect(root.findAll('.switch-leaf')[1]).toBe(sibling);

			root.update(client.SwitchPair, { first: 'large', second: 'other' });
			expect(root.find('.switch-large').textContent).toBe('A:1');
			expect(root.find('.switch-leaf')).toBe(sibling);
		} finally {
			root.unmount();
		}
	});

	it('keeps an incomplete switch in its source position when its empty case becomes visible', () => {
		const client = loadSwitchChildren('client');
		const root = mount(client.OptionalSwitchPair, { first: 'other' });

		try {
			const sibling = root.find('.switch-leaf');
			expect(root.find('.switch-host').textContent).toBe('B');

			root.update(client.OptionalSwitchPair, { first: 'large' });
			expect(root.find('.switch-host').textContent).toBe('AB');
			expect(root.find('.switch-leaf')).toBe(sibling);
			expect(root.find('.switch-host').children[0]).toBe(root.find('.switch-middle'));

			root.update(client.OptionalSwitchPair, { first: 'other' });
			expect(root.find('.switch-host').textContent).toBe('B');
			expect(root.find('.switch-leaf')).toBe(sibling);
		} finally {
			root.unmount();
		}
	});

	it('preserves a multi-root case and the following component across case changes', () => {
		const client = loadSwitchChildren('client');
		const root = mount(client.WideSwitchPair, { first: 'large' });

		try {
			const sibling = root.find('.switch-leaf');
			expect(
				Array.from(root.find('.switch-host').children).map((node) => node.textContent),
			).toEqual(['A', 'A', 'B']);

			root.update(client.WideSwitchPair, { first: 'other' });
			expect(root.find('.switch-host').textContent).toBe('AB');
			expect(root.findAll('.switch-leaf')[1]).toBe(sibling);

			root.update(client.WideSwitchPair, { first: 'large' });
			expect(root.find('.switch-host').textContent).toBe('AAB');
			expect(root.find('.switch-leaf')).toBe(sibling);
		} finally {
			root.unmount();
		}
	});

	it.each([
		['direct', 'ShadowedSwitchPair'],
		['nested', 'NestedShadowedSwitchPair'],
	])(
		'keeps a %s case-local component shadow in source order when it first becomes visible',
		(_, name) => {
			const client = loadSwitchChildren('client');
			const component = client[name];
			const root = mount(component, { visible: false });

			try {
				const sibling = root.find('.switch-leaf');
				expect(root.find('.switch-host').textContent).toBe('B');

				root.update(component, { visible: true });
				expect(
					Array.from(root.find('.switch-host').children).map((node) => node.textContent),
				).toEqual(['A', 'B']);
				expect(root.find('.switch-leaf')).toBe(sibling);
			} finally {
				root.unmount();
			}
		},
	);

	it('hydrates the original switch-child elements and keeps sibling identity after case changes', () => {
		const client = loadSwitchChildren('client');
		const server = loadSwitchChildren('server');
		const container = document.createElement('div');
		container.innerHTML = ServerRuntime.renderToString(server.SwitchPair, {
			first: 'large',
			second: 'other',
		}).html;
		document.body.appendChild(container);

		const first = container.querySelector('.switch-large');
		const second = container.querySelector('.switch-leaf');
		const root = hydrateRoot(container, client.SwitchPair, { first: 'large', second: 'other' });

		try {
			flushSync(() => {});
			expect(container.querySelector('.switch-large')).toBe(first);
			expect(container.querySelector('.switch-leaf')).toBe(second);

			flushSync(() => (first as HTMLButtonElement).click());
			expect(first?.textContent).toBe('A:1');

			flushSync(() => root.render(client.SwitchPair, { first: 'middle', second: 'other' }));
			expect(container.querySelector('.switch-middle')?.textContent).toBe('A');
			expect(container.querySelector('.switch-leaf')).toBe(second);

			flushSync(() => root.render(client.SwitchPair, { first: 'large', second: 'other' }));
			expect(container.querySelector('.switch-large')?.textContent).toBe('A:1');
			expect(container.querySelector('.switch-leaf')).toBe(second);
		} finally {
			root.unmount();
			container.remove();
		}
	});
});
