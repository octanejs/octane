import { describe, it, expect } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { mount } from './_helpers';
import { flushSync, hydrateRoot } from '../src/index.js';
import { loadServerFixture } from './_server-fixture.js';
import {
	PortalledWithTsrx,
	InlineTsrx,
	SubtemplateParamBranch,
	NestedTemplateReadsOuterLocal,
	PortalBranchReadsOuterLocal,
} from './_fixtures/tsrx-block.tsrx';

const FIXTURE = 'packages/octane/tests/_fixtures/tsrx-block.tsrx';

// The rendered arm's tag and text, ignoring hydration markers.
const arm = (host: Element | null) =>
	Array.from(host?.children ?? [], (child) => `${child.localName}:${child.textContent}`);

const steps: Array<[string, boolean]> = [
	['second', true],
	['third', false],
	['fourth', false],
	['fifth', true],
];

describe('<tsrx> expression block', () => {
	it('uses a tsrx-block bound to a const as a Portal child render fn', () => {
		const target = document.createElement('section');
		document.body.appendChild(target);
		const r = mount(PortalledWithTsrx, { target, label: 'hello' });
		expect(target.querySelector('.from-tsrx')!.textContent).toBe('hello');
		r.unmount();
		expect(target.querySelector('.from-tsrx')).toBe(null);
		target.remove();
	});

	it('uses a tsrx-block inline inside a JSX expression slot', () => {
		const target = document.createElement('section');
		document.body.appendChild(target);
		const r = mount(InlineTsrx, { target });
		expect(target.querySelector('.inline')!.textContent).toBe('inline');
		r.unmount();
		target.remove();
	});
});

describe('sub-template scope in control-flow arms', () => {
	it('reads a sub-template parameter in @if/@else arms', () => {
		const r = mount(SubtemplateParamBranch, { value: 'first', enabled: true });
		expect(arm(r.find('.param-host'))).toEqual(['b:first']);
		for (const [value, enabled] of steps) {
			r.update(SubtemplateParamBranch, { value, enabled });
			expect(arm(r.find('.param-host'))).toEqual([`${enabled ? 'b' : 'i'}:${value}`]);
		}
		r.unmount();
	});

	it('server-renders and hydrates arms that read a sub-template parameter', () => {
		const server = loadServerFixture(FIXTURE);
		const { html } = ServerRuntime.renderToString(server.SubtemplateParamBranch, {
			value: 'first',
			enabled: true,
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const original = container.querySelector('.param-host b');
		expect(original?.textContent).toBe('first');

		const root = hydrateRoot(container, SubtemplateParamBranch, { value: 'first', enabled: true });
		flushSync(() => {});
		expect(container.querySelector('.param-host b')).toBe(original);

		root.render(SubtemplateParamBranch, { value: 'second', enabled: true });
		flushSync(() => {});
		expect(container.querySelector('.param-host b')).toBe(original);
		expect(original?.textContent).toBe('second');

		root.render(SubtemplateParamBranch, { value: 'third', enabled: false });
		flushSync(() => {});
		expect(arm(container.querySelector('.param-host'))).toEqual(['i:third']);
		root.unmount();
		container.remove();
	});

	it('reads enclosing component locals in arms of a nested template function', () => {
		const r = mount(NestedTemplateReadsOuterLocal, { value: 'first', enabled: true });
		expect(arm(r.find('.nested-host'))).toEqual(['b:first:5']);
		for (const [value, enabled] of steps) {
			r.update(NestedTemplateReadsOuterLocal, { value, enabled });
			expect(arm(r.find('.nested-host'))).toEqual([
				enabled ? `b:${value}:${value.length}` : `i:${value}`,
			]);
		}
		r.unmount();
	});

	it('reads enclosing component locals in arms of a portal sub-template', () => {
		const target = document.createElement('section');
		document.body.appendChild(target);
		const r = mount(PortalBranchReadsOuterLocal, { value: 'first', enabled: true, target });
		expect(arm(target)).toEqual(['b:first']);
		for (const [value, enabled] of steps) {
			r.update(PortalBranchReadsOuterLocal, { value, enabled, target });
			expect(arm(target)).toEqual([`${enabled ? 'b' : 'i'}:${value}`]);
		}
		r.unmount();
		expect(target.children).toHaveLength(0);
		target.remove();
	});
});
