// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import { collectDiagnostics } from 'octane/compiler';
import { renderToStaticMarkup, renderToString } from 'octane/server';
import { mount } from '../../octane/tests/_helpers.js';
import { loadCompiledFixtureSource } from '../../octane/tests/_server-fixture.js';
import { strengthen } from '../dist/strong.js';
import { transformModule } from '../dist/transform.js';

afterEach(() => vi.restoreAllMocks());

it.each([
	['', true, '20'],
	[', []', false, '10'],
])('preserves the layout measurement schedule with dependencies %j', (deps, strong, afterClick) => {
	const source = `import { useState, useRef, useLayoutEffect } from 'react';
export function Meter() {
  const ref = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState(10);
  const [height, setHeight] = useState(7);
  useLayoutEffect(() => { setHeight(ref.current?.offsetHeight ?? 0); }${deps});
  return <button ref={ref} data-size={size} onClick={() => setSize(20)}>{height}</button>;
}`;
	const { code } = transformModule(source, 'meter.tsx', { strong: true });
	const id = 'meter.tsrx';
	const result = strengthen({ collectDiagnostics, from: 'octane/compiler' }, code, id);
	const { Meter: ServerMeter } = loadCompiledFixtureSource(result.code, { id, mode: 'server' });
	expect(renderToStaticMarkup(ServerMeter, {}).html).toContain('>7</button>');

	vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
		return Number(this.dataset.size);
	});
	const { Meter } = loadCompiledFixtureSource(result.code, { id, mode: 'client' });
	const view = mount(Meter);
	try {
		const button = view.find('button');
		expect(button.textContent).toBe('10');
		view.click('button');
		expect(view.find('button')).toBe(button);
		expect(button.textContent).toBe(afterClick);
		expect(result.strong).toBe(strong);
	} finally {
		view.unmount();
	}
});

it.each(['', 'export type StateHook = typeof state;', 'export const importedHook = state;'])(
	'removes only the superseded hook imports across measurements %j',
	(typeUse) => {
		const sample = (name) => `export function ${name}() {
  const node = host<HTMLDivElement>(null);
  const [width, setWidth] = state(7);
  layout(() => setWidth(node.current?.clientWidth ?? 0));
  return <div ref={node}>{width}</div>;
}`;
		const example = `"import { useLayoutEffect as layout } from 'octane'"`;
		const source = `import { useRef as host, useState as state, useLayoutEffect as layout } from 'react';
export const example = ${example};
export function total(layout: number, props: { state: number }) { return layout + props.state; }
${typeUse}
${sample('Panel')}
${sample('Badge')}`;
		const { code } = transformModule(source, 'meters.tsx', { strong: true });
		const result = strengthen({ collectDiagnostics, from: 'octane/compiler' }, code, 'meters.tsrx');
		const imports = result.code.split('\n').find((line) => line.startsWith('import '));
		expect(result.strong).toBe(true);
		expect(imports).not.toContain('useLayoutEffect');
		expect(imports.includes('useState as state')).toBe(Boolean(typeUse));
		expect(result.code).toContain(example);
	},
);

it('hydrates with the initial value and rechecks form ownership on the next commit', () => {
	const source = `import { useState, useRef, useLayoutEffect } from 'react';
export function Field({revision}: {revision: number}) {
  const input = useRef<HTMLButtonElement>(null);
  const [inside, setInside] = useState(true);
  useLayoutEffect(() => setInside(input.current?.closest('form') != null));
  return <button ref={input} data-revision={revision}>{inside ? 'inside' : 'outside'}</button>;
}`;
	const id = 'field.tsrx';
	const { code } = transformModule(source, 'field.tsx', { strong: true });
	const result = strengthen({ collectDiagnostics, from: 'octane/compiler' }, code, id);
	expect(result.strong).toBe(true);
	const server = loadCompiledFixtureSource(result.code, { id, mode: 'server' });
	const client = loadCompiledFixtureSource(result.code, { id, mode: 'client' });
	const host = document.createElement('div');
	host.innerHTML = renderToString(server.Field, { revision: 0 }).html;
	const button = host.querySelector('button');
	expect(button.textContent).toBe('inside');
	const root = hydrateRoot(host, client.Field, { revision: 0 });
	try {
		flushSync(() => {});
		expect(button.textContent).toBe('outside');
		document.createElement('form').appendChild(host);
		flushSync(() => root.render(client.Field, { revision: 1 }));
		expect(host.querySelector('button')).toBe(button);
		expect(button.textContent).toBe('inside');
	} finally {
		root.unmount();
	}
});
