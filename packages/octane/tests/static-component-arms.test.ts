import { describe, expect, it } from 'vitest';
import { createRoot, flushSync, type ComponentBody } from 'octane';
import { App, configureRead } from './_fixtures/static-component-arms.tsrx';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

describe('static component branches', () => {
	it('retains static DOM beside independent state and live setup reads', () => {
		let label = 'initial';
		const reads: string[] = [];
		configureRead(() => {
			reads.push(label);
			return label;
		});
		const props = { visible: true, selected: 'shown', tick: 0 };
		const view = mount(App, props);
		try {
			const regions = ['static-if', 'static-case', 'static-default'];
			const bodies = regions.map((region) => view.find(`.${region} .static-child`));
			const spans = bodies.map((body) => body.querySelector('span')!);
			const texts = spans.map((span) => span.firstChild);
			texts.forEach((text) => expect(text?.nodeType).toBe(Node.TEXT_NODE));
			const stateful = view.find('.stateful');
			const button = stateful.querySelector('button')!;
			const buttonText = Array.from(button.childNodes).find(
				(node) => node.nodeType === Node.TEXT_NODE,
			)!;
			expect(buttonText).toBeDefined();
			const input = stateful.querySelector('input')!;
			input.value = 'draft';
			expect(reads).toEqual(['initial', 'initial']);
			flushSync(() => button.click());
			expect(button.textContent).toBe('1');
			expect(reads).toEqual(['initial', 'initial']);
			label = 'updated';
			view.update(App, { ...props, tick: 1 });
			expect(view.find('.setup').textContent).toBe('updated');
			expect(view.find('.dynamic').textContent).toBe('updated');
			expect(reads).toEqual(['initial', 'initial', 'updated', 'updated']);
			regions.forEach((region, index) => {
				expect(view.find(`.${region} .static-child`)).toBe(bodies[index]);
				expect(bodies[index].querySelector('span')).toBe(spans[index]);
				expect(spans[index].firstChild).toBe(texts[index]);
				expect(spans[index].textContent).toBe('fixed');
			});
			view.update(App, { visible: false, selected: 'hidden', tick: 2 });
			expect(view.container.querySelector('.static-child')).toBeNull();
			bodies.forEach((body) => expect(body.isConnected).toBe(false));
			flushSync(() => button.click());
			view.update(App, { ...props, tick: 3 });
			regions.forEach((region, index) => {
				const replacement = view.find(`.${region} .static-child`);
				expect(replacement).not.toBe(bodies[index]);
				expect(replacement.querySelector('span')!.textContent).toBe('fixed');
				expect(replacement.querySelector('em')!.textContent).toBe('tail');
			});
			expect(view.find('.stateful')).toBe(stateful);
			expect(stateful.querySelector('button')).toBe(button);
			expect(Array.from(button.childNodes)).toContain(buttonText);
			expect(button.textContent).toBe('2');
			expect(stateful.querySelector('input')).toBe(input);
			expect(input.value).toBe('draft');
		} finally {
			view.unmount();
			configureRead(() => 'initial');
		}
		expect(view.container.childNodes).toHaveLength(0);
	});

	it.each([
		['an unselected if', '', '@if (props.show) { <Child /> }', ''],
		['an unselected case', '', '@switch (props.show) { @case true: { <Child /> } }', ''],
		[
			'an unselected default',
			'',
			'@switch (props.show) { @case false: { <em>hidden</em> } @default: { <Child /> } }',
			'hidden',
		],
		[
			'a selected arm superseded by its owner',
			'const [selected, setSelected] = useState(true);',
			'@if (props.show || (selected && (setSelected(false), true))) { <Child /> }',
			'',
		],
	] as const)(
		'does not read %s before its declaration initializes',
		(_name, setup, render, initialText) => {
			type Props = { show: boolean };
			// App is called while Child's declaration is still ahead in module order.
			// A branch that does not publish the child must not eagerly read its binding.
			const source = `import { useState } from 'octane';
import { boot } from './boot.js';
boot(App);
function Child() @{ <section><span>fixed</span></section> }
export function App(props: { show: boolean }) @{ ${setup} ${render} }`;
			const container = document.createElement('div');
			document.body.appendChild(container);
			const root = createRoot(container);
			let booted = false;
			try {
				const module = loadCompiledFixtureSource<{ App: ComponentBody<Props> }>(source, {
					id: '/src/static-component-arm-initialization.tsrx',
					mode: 'client',
					compileOptions: { dev: false, hmr: false },
					runtimeModules: {
						'./boot.js': {
							boot(App: ComponentBody<Props>) {
								flushSync(() => root.render(App, { show: false }));
								expect(container.querySelector('section')).toBeNull();
								expect(container.textContent).toBe(initialText);
								booted = true;
							},
						},
					},
				});
				expect(booted).toBe(true);
				flushSync(() => root.render(module.App, { show: true }));
				const section = container.querySelector('section')!;
				expect(section).not.toBeNull();
				const text = section.querySelector('span')!.firstChild;
				expect(section.textContent).toBe('fixed');
				flushSync(() => root.render(module.App, { show: true }));
				expect(container.querySelector('section')).toBe(section);
				expect(section.querySelector('span')!.firstChild).toBe(text);
				flushSync(() => root.render(module.App, { show: false }));
				expect(section.isConnected).toBe(false);
				flushSync(() => root.render(module.App, { show: true }));
				expect(container.querySelector('section')).not.toBe(section);
				expect(container.textContent).toBe('fixed');
			} finally {
				root.unmount();
				container.remove();
			}
			expect(container.childNodes).toHaveLength(0);
		},
	);
});
