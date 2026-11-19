import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import { compile } from 'octane/compiler';
import { renderToString } from 'octane/server';
import * as DomBindings from '../src/dom-bindings.js';
import * as DomBindingPrograms from '../src/dom-binding-program.js';
import * as DomBindingSignals from '../src/dom-binding-signals.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

const ID = '/src/binding-adapters.tsrx';
const SOURCE = `
export function Events(props) @{ 'use dom bindings';
 <section onClickCapture={props.capture} onClick={props.bubble}>
  <button onClick={props.action}>{props.label as string}</button>
 </section>
}
export function Refs(props) @{ 'use dom bindings'; <span ref={props.ref}>ref</span> }
export function Mixed(props) @{ 'use dom bindings'; <button onClick={props.action} ref={props.refs}>mixed</button> }
export function Nested(props) @{ 'use dom bindings'; <section>
 @if (props.show) { <button onClick={props.action}>event</button> }
 @else { <span ref={props.ref}>ref</span> }
</section> }
export function Pair(props) @{ 'use dom bindings'; <section>
 <button onClick={props.first}>first</button><button onClick={props.second}>second</button>
</section> }
`;

function artifactImports(view: string, dev: boolean): string[] {
	const code = compile(SOURCE, `${ID}?octane-bindings=${view}&octane-mount=1`, {
		mode: 'client',
		dev,
		hmr: false,
	}).code;
	return ts
		.createSourceFile(ID, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
		.statements.flatMap((statement) => {
			if (
				!ts.isImportDeclaration(statement) ||
				!ts.isStringLiteral(statement.moduleSpecifier) ||
				statement.moduleSpecifier.text !== 'octane/dom-binding-program'
			)
				return [];
			const bindings = statement.importClause?.namedBindings;
			return bindings && ts.isNamedImports(bindings)
				? bindings.elements.map((element) => element.propertyName?.text ?? element.name.text)
				: [];
		});
}

function fixture<Props extends object>(view: string, initial: Props, dev: boolean) {
	const runtimeModules = {
		'octane/behavior': DomBindings,
		'octane/dom-bindings': DomBindings,
		'octane/dom-binding-program': DomBindingPrograms,
		'octane/dom-binding-signals': DomBindingSignals,
	};
	const options = { compileOptions: { dev, hmr: false }, runtimeModules };
	const server = loadCompiledFixtureSource(SOURCE, { ...options, id: ID, mode: 'server' });
	const artifactId = `${ID}?octane-bindings=${view}&octane-mount=1`;
	const artifact = loadCompiledFixtureSource(SOURCE, {
		...options,
		id: artifactId,
		mode: 'client',
	});
	const activation = loadCompiledFixtureSource(
		`import {adoptBindings, mountBindings} from 'octane/behavior'; import {${view}} from './binding-adapters.tsrx'; export function attach(root, source, options) { return adoptBindings(root, ${view}, source, options); } export function mount(target, source, options) { return mountBindings(target, ${view}, source, options); }`,
		{
			...options,
			id: '/src/activate-adapters.tsrx',
			mode: 'client',
			runtimeModules: {
				...runtimeModules,
				[`./binding-adapters.tsrx?octane-bindings=${view}&octane-mount=1`]: artifact,
			},
		},
	);
	let snapshot = initial;
	const listeners = new Set<() => void>();
	const cleanup = vi.fn();
	const state: DomBindings.BindingSource<Props> = {
		getSnapshot: () => snapshot,
		subscribe(notify) {
			listeners.add(notify);
			return () => {
				listeners.delete(notify);
				cleanup();
			};
		},
	};
	return {
		html: renderToString(server[view], initial).html,
		client: () => loadCompiledFixtureSource(SOURCE, { ...options, id: ID, mode: 'client' })[view],
		state,
		cleanup,
		attach: activation['attach'] as (
			root: Element,
			source: typeof state,
			options?: DomBindings.BindingOptions,
		) => DomBindings.BindingHandle,
		publish(next: Partial<Props>, notify = true) {
			snapshot = { ...snapshot, ...next };
			if (notify) for (const listener of [...listeners]) listener();
		},
	};
}

function host(html: string): HTMLElement {
	const container = document.createElement('div');
	container.innerHTML = html;
	document.body.append(container);
	return container;
}

afterEach(() => {
	document.body.textContent = '';
	vi.restoreAllMocks();
});

describe('compiled native binding adapters', () => {
	for (const dev of [false, true]) {
		it(`selects only each fragment's required activation capability (${dev ? 'dev' : 'prod'})`, () => {
			// The compiled module's import graph is the optimization contract; local aliases are irrelevant.
			expect(artifactImports('Events', dev)).toContain('__activateBindingEvents');
			expect(artifactImports('Events', dev)).not.toContain('__activateBindingAdapters');
			expect(artifactImports('Refs', dev)).toContain('__activateBindingAdapters');
			expect(artifactImports('Refs', dev)).not.toContain('__activateBindingEvents');
			expect(artifactImports('Mixed', dev)).toContain('__activateBindingAdapters');
			expect(artifactImports('Mixed', dev)).not.toContain('__activateBindingEvents');
			expect(artifactImports('Nested', dev)).toEqual(
				expect.arrayContaining(['__activateBindingEvents', '__activateBindingAdapters']),
			);
		});

		it(`delivers capture and bubble to the current committed handlers and hands off once (${dev ? 'dev' : 'prod'})`, () => {
			const log: string[] = [];
			const initial = {
				label: 'first',
				capture: () => log.push('capture:first'),
				bubble: () => log.push('bubble:first'),
				action: function (this: HTMLElement, event: Event) {
					log.push(`action:${this.textContent}:${event.currentTarget === this}`);
				},
			};
			const view = fixture('Events', initial, dev);
			const container = host(view.html);
			const section = container.querySelector('section')!;
			const button = section.querySelector('button')!;
			const binding = view.attach(section, view.state);
			button.click();
			expect(log).toEqual(['capture:first', 'action:first:true', 'bubble:first']);
			view.publish({ label: 'unpublished', action: () => log.push('wrong') }, false);
			button.click();
			expect(log.slice(-3)).toEqual(['capture:first', 'action:first:true', 'bubble:first']);
			view.publish({
				label: 'second',
				action: () => log.push('action:second'),
				capture: () => log.push('capture:second'),
				bubble: () => log.push('bubble:second'),
			});
			button.click();
			expect(log.slice(-3)).toEqual(['capture:second', 'action:second', 'bubble:second']);
			const hydrated = hydrateRoot(container, view.client(), view.state.getSnapshot(), {
				bindingLeases: [binding],
			});
			flushSync(() => {});
			expect(container.querySelector('button')).toBe(button);
			expect(view.cleanup).toHaveBeenCalledOnce();
			const before = log.length;
			button.click();
			expect(log.slice(before)).toEqual(['capture:second', 'action:second', 'bubble:second']);
			hydrated.unmount();
			binding.dispose();
		});

		it(`cleans event delivery on abort and failed partial attachment (${dev ? 'dev' : 'prod'})`, () => {
			const first = vi.fn(),
				second = vi.fn();
			const view = fixture('Pair', { first, second }, dev);
			const container = host(view.html);
			const section = container.querySelector('section')!;
			const [one, two] = [...section.querySelectorAll('button')];
			const failure = new Error('listener attachment failed');
			vi.spyOn(two, 'addEventListener').mockImplementationOnce(() => {
				throw failure;
			});
			expect(() => view.attach(section, view.state)).toThrow(failure);
			one.click();
			two.click();
			expect(first).not.toHaveBeenCalled();
			expect(second).not.toHaveBeenCalled();
			expect(view.cleanup).toHaveBeenCalledOnce();
			vi.restoreAllMocks();
			const controller = new AbortController();
			const binding = view.attach(section, view.state, { signal: controller.signal });
			one.click();
			expect(first).toHaveBeenCalledOnce();
			controller.abort();
			one.click();
			binding.dispose();
			expect(first).toHaveBeenCalledOnce();
			expect(view.cleanup).toHaveBeenCalledTimes(2);
		});

		it(`preserves mixed ref ordering and switches nested fragment capabilities (${dev ? 'dev' : 'prod'})`, () => {
			const log: string[] = [];
			const refs = ['first', 'second'].map((name) => (node: Element | null) => {
				if (!node) return;
				log.push(`ref:${name}`);
				(node as HTMLElement).click();
				return () => {
					log.push(`cleanup:${name}`);
					(node as HTMLElement).click();
				};
			});
			const mixed = fixture('Mixed', { action: () => log.push('click'), refs }, dev);
			const mixedHost = host(mixed.html);
			const binding = mixed.attach(mixedHost.querySelector('button')!, mixed.state);
			expect(log).toEqual(['ref:first', 'click', 'ref:second', 'click']);
			binding.dispose();
			expect(log).toEqual([
				'ref:first',
				'click',
				'ref:second',
				'click',
				'cleanup:first',
				'cleanup:second',
			]);
			const action = vi.fn(),
				ref = vi.fn();
			const nested = fixture('Nested', { show: true, action, ref }, dev);
			const nestedHost = host(nested.html);
			const nestedBinding = nested.attach(nestedHost.querySelector('section')!, nested.state);
			const old = nestedHost.querySelector('button')!;
			old.click();
			nested.publish({ show: false });
			old.click();
			expect(action).toHaveBeenCalledOnce();
			expect(ref).toHaveBeenCalledWith(nestedHost.querySelector('span'));
			nestedBinding.dispose();
			expect(ref).toHaveBeenLastCalledWith(null);
		});
	}
});
