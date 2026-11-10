import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile.js';
import { slotHooks } from '../../src/compiler/slot-hooks.js';
import { compileToVolarMappings } from '../../src/compiler/volar.js';

const MANAGED_DOM_WRITE = 'OCTANE_STRONG_MANAGED_DOM_WRITE';
const RAW_HTML_WRITE = 'OCTANE_STRONG_RAW_HTML_WRITE';
const OWN_MARKUP_QUERY = 'OCTANE_STRONG_OWN_MARKUP_QUERY';
const LAYOUT_SNAPSHOT_WRITE = 'OCTANE_STRONG_LAYOUT_SNAPSHOT_WRITE';
const DEFERRED_CURRENT_TARGET = 'OCTANE_STRONG_DEFERRED_CURRENT_TARGET';
const FORCED_LAYOUT = 'OCTANE_STRONG_FORCED_LAYOUT';

const IMPORTS = "import { useEffect, useLayoutEffect, useRef, useState } from 'octane';\n";
const MODES = [
	{ mode: 'client', dev: true },
	{ mode: 'client', dev: false },
	{ mode: 'server', dev: true },
	{ mode: 'server', dev: false },
] as const;

function errors(source: string, filename: string) {
	return compileToVolarMappings(source, filename).diagnostics.filter(
		(diagnostic: { severity: string }) => diagnostic.severity === 'error',
	);
}

/** Compatibility mode accepts the module; Strong rejects it everywhere with `code`. */
function expectStrongError(source: string, filename: string, code: string) {
	expect(() => compile(source, filename)).not.toThrow();
	const strong = `"use strong";\n${source}`;
	expect(() => compile(strong, filename)).toThrow(code);
	for (const options of MODES) {
		expect(() => compile(source, filename, { ...options, strong: true } as any)).toThrow(code);
	}
	expect(errors(strong, filename)).toContainEqual(
		expect.objectContaining({ code, severity: 'error' }),
	);
}

function expectStrongValid(source: string, filename: string) {
	const strong = `"use strong";\n${source}`;
	expect(() => compile(strong, filename)).not.toThrow();
	expect(errors(strong, filename)).toEqual([]);
}

function messageOf(source: string, filename: string, code: string): string {
	const diagnostic = errors(`"use strong";\n${source}`, filename).find(
		(entry: { code: string }) => entry.code === code,
	);
	expect(diagnostic).toBeDefined();
	return diagnostic!.message;
}

const effect = (write: string, element: string, props = '{ label, on, html, color }') =>
	`${IMPORTS}export function App(${props}) {
  const r = useRef(null);
  useEffect(() => { ${write} });
  return ${element};
}`;

describe('Strong managed DOM writes through refs', () => {
	it.each([
		['textContent', 'r.current.textContent = label.toUpperCase();', '<p ref={r}>{label}</p>'],
		['innerText', 'r.current.innerText = label;', '<p ref={r}>text</p>'],
		[
			'appendChild',
			"r.current.appendChild(document.createElement('b'));",
			'<p ref={r}>{label}</p>',
		],
		['append', "r.current.append('more');", '<p ref={r}>{label}</p>'],
		['replaceChildren', 'r.current.replaceChildren();', '<ul ref={r}><li>{label}</li></ul>'],
		['a children prop', 'r.current.textContent = label;', '<p ref={r} children={label} />'],
		[
			'dangerouslySetInnerHTML content',
			'r.current.textContent = label;',
			'<p ref={r} dangerouslySetInnerHTML={html} />',
		],
		['className', "r.current.className = on ? 'on' : '';", '<p ref={r} className="base" />'],
		[
			'className compound writes',
			"r.current.className += ' on';",
			'<p ref={r} className="base" />',
		],
		['classList mutators', "r.current.classList.toggle('on', on);", '<p ref={r} class="base" />'],
		['classList.value', "r.current.classList.value = 'on';", '<p ref={r} className="base" />'],
		[
			'setAttribute class',
			"r.current.setAttribute('class', 'on');",
			'<p ref={r} className="base" />',
		],
		[
			'template-set attributes',
			"r.current.setAttribute('data-state', 'open');",
			'<p ref={r} data-state="closed" />',
		],
		['aliased attributes', "r.current.removeAttribute('for');", '<label ref={r} htmlFor="name" />'],
		['toggleAttribute', "r.current.toggleAttribute('hidden');", '<p ref={r} hidden={on} />'],
		[
			'style.cssText',
			"r.current.style.cssText = 'color: red';",
			'<p ref={r} style={{ margin: 0 }} />',
		],
		[
			'whole style assignment',
			"r.current.style = 'color: red';",
			'<p ref={r} style="margin: 0" />',
		],
		[
			'setAttribute style',
			"r.current.setAttribute('style', 'color: red');",
			'<p ref={r} style={{ margin: 0 }} />',
		],
		[
			'a style property the template sets',
			'r.current.style.backgroundColor = color;',
			"<p ref={r} style={{ backgroundColor: 'red' }} />",
		],
		[
			'kebab-case style properties',
			"r.current.style.setProperty('background-color', color);",
			"<p ref={r} style={{ backgroundColor: 'red', ...extra }} />",
		],
		[
			'string style declarations',
			'r.current.style.color = color;',
			'<p ref={r} style="color: red; margin: 0" />',
		],
		['computed literal keys', "r.current['textContent'] = label;", '<p ref={r}>{label}</p>'],
		['optional chains', "r.current?.classList.add('on');", '<p ref={r} className="base" />'],
		[
			'non-null and type assertions',
			'(r.current as HTMLElement)!.innerText = label;',
			'<p ref={r}>{label}</p>',
		],
		[
			'const aliases',
			'const el = r.current; if (el) el.textContent = label;',
			'<p ref={r}>{label}</p>',
		],
		[
			'chained aliases',
			'const el = r.current; const target = el; target.textContent = label;',
			'<p ref={r}>{label}</p>',
		],
		[
			'unreassigned let aliases',
			'let el = r.current; el.textContent = label;',
			'<p ref={r}>{label}</p>',
		],
		[
			'destructured aliases',
			'const { current: node } = r; node.textContent = label;',
			'<p ref={r}>{label}</p>',
		],
		[
			'nested helpers',
			'function paint() { r.current.textContent = label; } paint();',
			'<p ref={r}>{label}</p>',
		],
		['array refs', 'r.current.textContent = label;', '<p ref={[r, other]}>{label}</p>'],
		[
			'conditional elements',
			'r.current.textContent = label;',
			'<div>{on && <p ref={r}>{label}</p>}</div>',
		],
	])('rejects %s', (_label, write, element) => {
		const source = effect(write, element, '{ label, on, html, color, extra, other }');
		expectStrongError(source, '/src/App.tsrx', MANAGED_DOM_WRITE);
	});

	it.each([
		['innerHTML on an empty element', 'r.current.innerHTML = html;', '<div ref={r} />'],
		[
			'innerHTML over rendered children',
			'r.current.innerHTML = html;',
			'<div ref={r}>{label}</div>',
		],
		['outerHTML', 'r.current.outerHTML = html;', '<div ref={r} />'],
		['insertAdjacentHTML', "r.current.insertAdjacentHTML('beforeend', html);", '<div ref={r} />'],
		['setHTMLUnsafe', 'r.current.setHTMLUnsafe(html);', '<div ref={r} />'],
	])('rejects raw HTML through %s', (_label, write, element) => {
		expectStrongError(effect(write, element), '/src/App.tsrx', RAW_HTML_WRITE);
	});

	it('names the replacement in each message', () => {
		expect(
			messageOf(
				effect('r.current.innerHTML = html;', '<div ref={r} />'),
				'/src/App.tsrx',
				RAW_HTML_WRITE,
			),
		).toContain('dangerouslySetInnerHTML={trustHTML(html)}');
		expect(
			messageOf(
				effect('r.current.textContent = label;', '<p ref={r}>{label}</p>'),
				'/src/App.tsrx',
				MANAGED_DOM_WRITE,
			),
		).toContain('Render the content as its children from state or props');
		expect(
			messageOf(
				effect("r.current.className = 'on';", '<p ref={r} className="base" />'),
				'/src/App.tsrx',
				MANAGED_DOM_WRITE,
			),
		).toContain("class={['base', active && 'active']}");
	});

	it('checks writes in event handlers, layout effects, and callback refs', () => {
		expectStrongError(
			`${IMPORTS}export function App({ label }) {
  const r = useRef(null);
  return <p ref={r} onClick={() => { r.current.textContent = 'clicked'; }}>{label}</p>;
}`,
			'/src/App.tsrx',
			MANAGED_DOM_WRITE,
		);
		expectStrongError(
			`${IMPORTS}export function App({ on }) {
  const r = useRef(null);
  useLayoutEffect(() => { r.current.classList.add(on ? 'on' : 'off'); });
  return <p ref={r} className="base" />;
}`,
			'/src/App.tsrx',
			MANAGED_DOM_WRITE,
		);
		expectStrongError(
			`export function App({ label }) {
  return <p ref={(element) => { if (element) element.textContent = label; }}>{label}</p>;
}`,
			'/src/App.tsrx',
			MANAGED_DOM_WRITE,
		);
	});

	it.each([
		[
			'aliased imports',
			"import { useEffect, useRef as useElementRef } from 'octane';\n",
			'useElementRef(null)',
			'useEffect',
		],
		[
			'namespace imports',
			"import * as Octane from 'octane';\n",
			'Octane.useRef(null)',
			'Octane.useEffect',
		],
	])('recognizes useRef through %s', (_label, imports, ref, useEffect) => {
		expectStrongError(
			`${imports}export function App({ label }) {
  const r = ${ref};
  ${useEffect}(() => { r.current.textContent = label; });
  return <p ref={r}>{label}</p>;
}`,
			'/src/App.tsrx',
			MANAGED_DOM_WRITE,
		);
	});

	it('treats a host whose only child is a scoped style block as empty', () => {
		// Sibling-scoped <style> is extracted; it is not part of the host's child list.
		expectStrongValid(
			`${IMPORTS}export function Chart() @{
  const host = useRef(null);
  useEffect(() => { host.current.appendChild(document.createElement('canvas')); });
  <div ref={host} class="chart">
    <style>.chart { height: 200px; }</style>
  </div>
}`,
			'/src/Chart.tsrx',
		);
		expectStrongError(
			`${IMPORTS}export function Chart({ label }) @{
  const host = useRef(null);
  useEffect(() => { host.current.textContent = label; });
  <div ref={host} class="chart">
    <style>.chart { height: 200px; }</style>
    {label as string}
  </div>
}`,
			'/src/Chart.tsrx',
			MANAGED_DOM_WRITE,
		);
	});

	it('checks the TSRX ref attribute shorthand', () => {
		expectStrongError(
			`${IMPORTS}export function App({ label }) @{
  const ref = useRef(null);
  useEffect(() => { ref.current.textContent = label; });
  <p {ref}>{label as string}</p>
}`,
			'/src/App.tsrx',
			MANAGED_DOM_WRITE,
		);
	});

	it('checks .tsrx components and refs declared in keyed @for rows', () => {
		expectStrongError(
			`${IMPORTS}export function App({ label }) @{
  const r = useRef(null);
  useEffect(() => { r.current.textContent = label; });
  <p ref={r}>{label as string}</p>
}`,
			'/src/App.tsrx',
			MANAGED_DOM_WRITE,
		);
		expectStrongError(
			`${IMPORTS}export function List({ items }) @{
  <ul>
    @for (const item of items; key item.id) {
      const row = useRef(null);
      useEffect(() => { row.current.className = 'seen'; });
      <li ref={row} class="row">{item.name as string}</li>
    }
  </ul>
}`,
			'/src/List.tsrx',
			MANAGED_DOM_WRITE,
		);
	});

	it('locates the write in compiler and editor diagnostics', () => {
		const source = `"use strong";\n${effect('r.current.textContent = label;', '<p ref={r}>{label}</p>')}`;
		const start = source.indexOf('r.current.textContent');
		expect(errors(source, '/src/App.tsrx')).toContainEqual(
			expect.objectContaining({
				code: MANAGED_DOM_WRITE,
				start: expect.objectContaining({ offset: start }),
				end: expect.objectContaining({ offset: start + 'r.current.textContent'.length }),
			}),
		);
		expect(() => compile(source, '/src/App.tsrx')).toThrow(
			/App\.tsrx:5:\d+: \[OCTANE_STRONG_MANAGED_DOM_WRITE\]/,
		);
	});

	it.each([
		[
			'textContent on an element without rendered children',
			'r.current.textContent = label;',
			'<span ref={r} />',
		],
		[
			'mounting into an empty container',
			"r.current.appendChild(document.createElement('canvas'));",
			'<div ref={r} class="chart" />',
		],
		[
			'mounting into a formatted empty container',
			"r.current.replaceChildren(document.createElement('canvas'));",
			'<div ref={r} class="chart">\n    </div>',
		],
		[
			'className when the template sets no class',
			"r.current.className = 'on';",
			'<p ref={r} id="x" />',
		],
		[
			'a style property the template leaves alone',
			"r.current.style.transform = 'none';",
			"<p ref={r} style={{ position: 'absolute' }} />",
		],
		[
			'style properties behind a dynamic style value',
			"r.current.style.transform = 'none';",
			'<p ref={r} style={color} />',
		],
		[
			'attributes the template does not set',
			"r.current.setAttribute('aria-expanded', 'true');",
			'<p ref={r} id="x" />',
		],
		[
			'reads, focus, and measurement',
			'console.log(r.current.textContent, r.current.getBoundingClientRect()); r.current.focus();',
			'<input ref={r} value={label} className="field" />',
		],
		[
			'a ref passed to a component',
			'r.current.textContent = label;',
			'<Field ref={r}>{label}</Field>',
		],
		[
			'a ref attached to two elements',
			'r.current.textContent = label;',
			'<div><p ref={r}>{label}</p><p ref={r}>{label}</p></div>',
		],
		[
			'a ref attached in a render callback',
			'r.current.textContent = label;',
			'<Field render={(n) => <li ref={r}>{n}</li>} />',
		],
		[
			'a ref whose target is reassigned',
			'r.current = other; r.current.textContent = label;',
			'<p ref={r}>{label}</p>',
		],
		[
			'a ref passed to a helper',
			'measure(r); r.current.textContent = label;',
			'<p ref={r}>{label}</p>',
		],
		[
			'a conditionally chosen ref',
			'r.current.textContent = label;',
			'<p ref={on ? r : undefined}>{label}</p>',
		],
		[
			'a conditional entry in a ref list',
			'r.current.textContent = label;',
			'<div><p ref={r}>{label}</p><p ref={[other, on ? r : null]}>{label}</p></div>',
		],
		[
			'a shadowed ref name',
			'function paint(r) { r.current.textContent = label; } paint(other);',
			'<p ref={r}>{label}</p>',
		],
		[
			'a reassigned alias',
			'let el = r.current; el = other; el.textContent = label;',
			'<p ref={r}>{label}</p>',
		],
	])('allows %s', (_label, write, element) => {
		const source = `${effect(write, element, '{ label, on, color, other }')}
function Field(props) { return <p>{props.children}</p>; }
function measure(ref) { return ref; }`;
		expectStrongValid(source, '/src/App.tsrx');
	});

	it('does not prove a ref declared outside the @for row that attaches it', () => {
		expectStrongValid(
			`${IMPORTS}export function List({ items }) @{
  const shared = useRef(null);
  useEffect(() => { shared.current.className = 'seen'; });
  <ul>
    @for (const item of items; key item.id) {
      <li ref={shared} class="row">{item.name as string}</li>
    }
  </ul>
}`,
			'/src/List.tsrx',
		);
	});

	it('does not treat a shadowed useRef or a plain-module ref parameter as proof', () => {
		expectStrongValid(
			`import { useEffect } from 'octane';
const useRef = (value) => ({ current: value });
export function App({ label }) {
  const r = useRef(null);
  useEffect(() => { r.current.textContent = label; });
  return <p ref={r}>{label}</p>;
}`,
			'/src/App.tsrx',
		);
		const plain = `"use strong";
import { useEffect } from 'octane';
export function useUppercase(ref, label) {
  useEffect(() => { ref.current.textContent = label.toUpperCase(); });
}`;
		expect(() => slotHooks(plain, '/src/useUppercase.ts')).not.toThrow();
	});

	it('keeps compatibility mode and valid Strong output unchanged', () => {
		const source = `${IMPORTS}export function Ticker({ value }) {
  const r = useRef(null);
  useEffect(() => { r.current.textContent = String(value); });
  return <div className="ticker"><span ref={r} /></div>;
}`;
		for (const mode of ['client', 'server'] as const) {
			const standard = compile(source, '/src/Ticker.tsrx', { mode });
			const strong = compile(source, '/src/Ticker.tsrx', { mode, strong: true } as any);
			expect(strong.code).toBe(standard.code);
			expect(strong.diagnostics).toEqual(standard.diagnostics);
		}
	});
});

describe('Strong queries for a component’s own markup', () => {
	const query = (call: string, element: string) =>
		`${IMPORTS}export function App({ on }) {
  useEffect(() => { ${call}; });
  return ${element};
}`;

	it.each([
		['getElementById', "document.getElementById('x').focus()", '<input id="x" />'],
		[
			'a class selector',
			"document.querySelector('.box').classList.add('on')",
			'<div class="box" />',
		],
		['an id selector', "document.querySelector('#search').focus()", '<input id="search" />'],
		[
			'a compound selector',
			"document.querySelectorAll('li.item.active')",
			'<ul><li className="item active" /></ul>',
		],
		['getElementsByClassName', "document.getElementsByClassName('a b')", '<p class="a b c" />'],
		['class arrays', "document.querySelector('.box')", "<div class={['box', on && 'on']} />"],
		['template literal selectors', 'document.getElementById(`x`)', '<input id={`x`} />'],
		['window.document', "window.document.getElementById('x')", '<input id="x" />'],
		['globalThis.document', "globalThis.document.querySelector('#x')", '<input id="x" />'],
		['optional calls', "document.getElementById?.('x')?.focus()", '<input id="x" />'],
	])('rejects %s', (_label, call, element) => {
		expectStrongError(query(call, element), '/src/App.tsrx', OWN_MARKUP_QUERY);
	});

	it('follows document aliases, event handlers, and .tsrx @for rows', () => {
		expectStrongError(
			`const doc = document;
export function App() {
  return <button id="save" onClick={() => doc.getElementById('save').blur()}>Save</button>;
}`,
			'/src/App.tsrx',
			OWN_MARKUP_QUERY,
		);
		expectStrongError(
			`${IMPORTS}export function List({ items }) @{
  useEffect(() => { document.querySelector('.row').scrollIntoView(); });
  <ul>
    @for (const item of items; key item.id) {
      <li class="row">{item.name as string}</li>
    }
  </ul>
}`,
			'/src/List.tsrx',
			OWN_MARKUP_QUERY,
		);
	});

	it('names a ref as the replacement', () => {
		const message = messageOf(
			query("document.getElementById('x').focus()", '<input id="x" />'),
			'/src/App.tsrx',
			OWN_MARKUP_QUERY,
		);
		expect(message).toContain('ref={element}');
		expect(message).toContain('#x');
	});

	it.each([
		['portal targets', "document.getElementById('modal-root')", '<input id="x" />'],
		['dynamic selectors', 'document.getElementById(on)', '<input id="x" />'],
		[
			'selectors with combinators',
			"document.querySelector('.list .item')",
			'<ul class="list"><li class="item" /></ul>',
		],
		[
			'classes the component does not render',
			"document.querySelector('.box.other')",
			'<div class="box" />',
		],
		['a mismatched tag', "document.querySelector('span.box')", '<div class="box" />'],
		['dynamic ids', "document.getElementById('x')", '<input id={on} />'],
		['element-scoped queries', "document.body.querySelector('#x')", '<input id="x" />'],
	])('allows %s', (_label, call, element) => {
		expectStrongValid(query(call, element), '/src/App.tsrx');
	});

	it('scopes markup to one component and respects a shadowed document', () => {
		expectStrongValid(
			`${IMPORTS}export function Toolbar() {
  useEffect(() => { document.getElementById('editor').focus(); });
  return <button>Focus</button>;
}
export function Editor() { return <textarea id="editor" />; }
export function Frame({ document }) {
  useEffect(() => { document.getElementById('x').focus(); });
  return <input id="x" />;
}`,
			'/src/App.tsrx',
		);
	});
});

const SNAPSHOT_IMPORTS =
	"import { useEffect, useLayoutEffect, useLayoutSnapshot, useRef } from 'octane';\n";
const snapshot = (body: string, element = '<div ref={r}>{String(width)}</div>') =>
	`${SNAPSHOT_IMPORTS}export function App({ label, name }) {
  const r = useRef(null);
  const width = useLayoutSnapshot(() => { ${body} }, { initial: 0 });
  return ${element};
}`;

describe('Strong DOM writes in a layout snapshot measurement', () => {
	it.each([
		['a style property', "r.current.style.width = '10px';"],
		['a dynamic style property', "r.current.style.setProperty(name, '1px');"],
		['cssText', "r.current.style.cssText = 'width: 10px';"],
		['className', "r.current.className = 'wide';"],
		['classList', "r.current.classList.add('wide');"],
		['an attribute', "r.current.setAttribute('data-wide', '');"],
		['a dynamic attribute', 'r.current.removeAttribute(name);'],
		['children', "r.current.append('more');", '<p><i ref={r} />{String(width)}</p>'],
		['a scroll offset', 'r.current.scrollTop = 0;'],
		['a compound scroll offset', 'r.current.scrollTop += 10;'],
		['a scroll offset update', 'r.current.scrollLeft++;'],
		['an alias', "const el = r.current; el.style.width = '10px';"],
	])('rejects %s', (_label, write, element?: string) => {
		expectStrongError(
			snapshot(`${write} return r.current.offsetWidth;`, element),
			'/src/App.tsrx',
			LAYOUT_SNAPSHOT_WRITE,
		);
	});

	it('rejects a write in a measurement held by a local', () => {
		expectStrongError(
			`${SNAPSHOT_IMPORTS}export function App() {
  const r = useRef(null);
  const measure = () => { r.current.style.width = 'auto'; return r.current.offsetWidth; };
  const width = useLayoutSnapshot(measure, { initial: 0 });
  return <div ref={r}>{String(width)}</div>;
}`,
			'/src/App.tsrx',
			LAYOUT_SNAPSHOT_WRITE,
		);
	});

	it('names the write and the replacement', () => {
		const message = messageOf(
			snapshot("r.current.style.width = 'auto'; return r.current.offsetWidth;"),
			'/src/App.tsrx',
			LAYOUT_SNAPSHOT_WRITE,
		);
		expect(message).toContain('`style.width`');
		expect(message).toContain('useLayoutEffect');
	});

	it('keeps the ownership error for a write the template also owns', () => {
		const source = snapshot(
			"r.current.className = 'wide'; return r.current.offsetWidth;",
			'<div ref={r} class="box">{String(width)}</div>',
		);
		expectStrongError(source, '/src/App.tsrx', MANAGED_DOM_WRITE);
		expect(errors(`"use strong";\n${source}`, '/src/App.tsrx')).toHaveLength(1);
	});

	it.each([
		['reads', 'return r.current.offsetWidth + r.current.scrollTop;'],
		['a read of an inline style', 'return r.current.style.width;'],
		[
			'a write in a callback that runs later',
			"requestAnimationFrame(() => { r.current.style.width = 'auto'; }); return 0;",
		],
		[
			'a write to a detached element',
			"const el = document.createElement('i'); el.style.width = '1px'; return el.offsetWidth;",
		],
	])('allows %s', (_label, body) => {
		expectStrongValid(snapshot(body), '/src/App.tsrx');
	});

	it('allows the same writes in a layout effect and on a ref that holds no element', () => {
		expectStrongValid(
			`${SNAPSHOT_IMPORTS}export function App() {
  const r = useRef(null);
  const box = useRef({ style: { width: '' }, scrollTop: 0 });
  useLayoutEffect(() => { r.current.style.width = 'auto'; r.current.scrollTop = 0; });
  const width = useLayoutSnapshot(() => {
    box.current.style.width = 'auto';
    box.current.scrollTop = 1;
    return r.current.offsetWidth;
  }, { initial: 0 });
  return <div ref={r}>{String(width)}</div>;
}`,
			'/src/App.tsrx',
		);
	});
});

const ASYNC_HANDLER = 'onClick={async (event) => { BODY }}';
const handler = (body: string, attribute = 'onClick={(event) => { BODY }}') =>
	`export function App({ save, element }) {
  return <button ${attribute.replace('BODY', body)}>Save</button>;
}`;

describe('Strong event.currentTarget after the handler returns', () => {
	it.each([
		['a timer callback', 'setTimeout(() => event.currentTarget.focus(), 100);'],
		['an animation frame', 'window.requestAnimationFrame(() => { event.currentTarget.blur(); });'],
		['a promise continuation', 'save().then(() => { event.currentTarget.disabled = false; });'],
		['an optional read', 'queueMicrotask(() => event?.currentTarget?.focus());'],
		[
			'a callback created in a timer',
			'setTimeout(() => [1].forEach(() => event.currentTarget.focus()));',
		],
		['code after an await', 'await save(); event.currentTarget.disabled = false;', ASYNC_HANDLER],
		[
			'a branch after an awaited value',
			'const ok = await save(); if (ok) { event.currentTarget.focus(); }',
			ASYNC_HANDLER,
		],
		[
			'a callback created after an await',
			'await save(); [1].forEach(() => event.currentTarget.focus());',
			ASYNC_HANDLER,
		],
		[
			'an await in a nested async function',
			'(async () => { await save(); event.currentTarget.focus(); })();',
		],
		[
			'a capture handler',
			'setTimeout(() => event.currentTarget.focus());',
			'onClickCapture={(event) => { BODY }}',
		],
	])('rejects %s', (_label, body, attribute?: string) => {
		expectStrongError(handler(body, attribute), '/src/App.tsrx', DEFERRED_CURRENT_TARGET);
	});

	it('rejects a handler held by a local, declared in another statement', () => {
		expectStrongError(
			`const press = (event) => { setTimeout(() => event.currentTarget.focus()); };
export function App() {
  return <button onClick={press}>Save</button>;
}`,
			'/src/App.tsrx',
			DEFERRED_CURRENT_TARGET,
		);
	});

	it('names the parameter and the capture to write', () => {
		const message = messageOf(
			handler('setTimeout(() => e.currentTarget.focus());', 'onClick={(e) => { BODY }}'),
			'/src/App.tsrx',
			DEFERRED_CURRENT_TARGET,
		);
		expect(message).toContain('`e.currentTarget`');
		expect(message).toContain('const element = e.currentTarget');
	});

	it.each([
		['a synchronous read', 'event.currentTarget.focus();'],
		[
			'an element captured before the timer',
			'const el = event.currentTarget; setTimeout(() => el.focus());',
		],
		[
			'a read before the await',
			'const el = event.currentTarget; await save(); el.disabled = false;',
			ASYNC_HANDLER,
		],
		[
			'a read after an await that may be skipped',
			'if (element) { await save(); } event.currentTarget.focus();',
			ASYNC_HANDLER,
		],
		['a synchronous callback', '[1].forEach(() => event.currentTarget.focus());'],
		['event.target in a timer', 'setTimeout(() => event.target.focus());'],
		[
			'a timer callback with its own parameter',
			'setTimeout((event) => event.currentTarget.focus(), 0, element);',
		],
		[
			'a shadowed timer',
			'const setTimeout = (run) => run(); setTimeout(() => event.currentTarget.focus());',
		],
		['an object that is not the event', 'setTimeout(() => element.currentTarget.focus());'],
	])('allows %s', (_label, body, attribute?: string) => {
		expectStrongValid(handler(body, attribute), '/src/App.tsrx');
	});

	it('allows a deferred read in a callback passed to a component', () => {
		expectStrongValid(
			`import { Field } from './Field.tsrx';
export function App() {
  return <Field onCommit={(event) => { setTimeout(() => event.currentTarget.focus()); }} />;
}`,
			'/src/App.tsrx',
		);
	});
});

describe('Strong forced-layout hints', () => {
	const DIV = '<div ref={r} />';
	const found = (source: string, options?: object) =>
		compile(source, '/src/App.tsrx', options as any).diagnostics.filter(
			(diagnostic: { code: string }) => diagnostic.code === FORCED_LAYOUT,
		);
	/** The hint messages for an effect body, identical in every mode. */
	const hints = (body: string, element = DIV) => {
		const source = `"use strong";\n${effect(`const el = r.current; ${body}`, element, '{ items }')}`;
		const messages = MODES.map((options) =>
			found(source, options)
				.map((diagnostic: { severity: string; message: string }) => {
					expect(diagnostic.severity).toBe('hint');
					return diagnostic.message;
				})
				.join('\n'),
		);
		expect(new Set(messages).size).toBe(1);
		// A hint never fails the module.
		expect(errors(source, '/src/App.tsrx')).toEqual([]);
		return messages[0];
	};

	it.each([
		[
			'a style write',
			"el.style.height = 'auto'; log(el.scrollHeight);",
			'scrollHeight',
			'style.height',
		],
		[
			'a class write',
			"el.classList.add('open'); log(el.offsetWidth);",
			'offsetWidth',
			'classList.add',
		],
		[
			'an attribute write',
			"el.setAttribute('hidden', ''); log(el.getBoundingClientRect());",
			'getBoundingClientRect()',
			'setAttribute',
		],
		['a scroll write', 'el.scrollTop = 0; log(el.clientHeight);', 'clientHeight', 'scrollTop'],
		[
			'a write in a branch that falls through',
			"if (items) { el.style.width = '1px'; } log(el.offsetWidth);",
			'offsetWidth',
			'style.width',
		],
		[
			'a write through the ref itself',
			"r.current.style.width = '1px'; log(r.current.offsetWidth);",
			'offsetWidth',
			'style.width',
		],
	])('reports a read after %s', (_label, body, read, write) => {
		const message = hints(body);
		expect(message).toContain(`\`${read}\` reads layout after the \`${write}\` write`);
		expect(message).toContain('read it first');
	});

	it.each([
		[
			'a for…of loop',
			"for (const item of items) { const width = el.offsetWidth; el.style.width = width + item + 'px'; }",
		],
		[
			'a for…of binding default',
			"for (const { size = el.offsetWidth } of items) { el.style.width = size + 'px'; }",
		],
		['a for condition', "for (let i = 0; i < el.offsetWidth; i++) { el.style.width = i + 'px'; }"],
		[
			'a while loop',
			"let i = 0; while (i++ < 3) { const width = el.offsetWidth; el.style.width = width + 'px'; }",
		],
	])('reports a read before a write in %s', (_label, body) => {
		const message = hints(body);
		expect(message).toContain(
			'`offsetWidth` reads layout in a loop that also writes `style.width`',
		);
		expect(message).toContain('then write in a second');
	});

	it('reports each read once, at the read', () => {
		const source = `"use strong";\n${effect(
			"const el = r.current; el.style.width = '1px'; log(el.offsetWidth, el.offsetHeight);",
			DIV,
		)}`;
		expect(
			found(source).map((diagnostic: any) =>
				source.slice(diagnostic.start.offset, diagnostic.end.offset),
			),
		).toEqual(['el.offsetWidth', 'el.offsetHeight']);
	});

	it.each([
		['a read before the write', "const height = el.scrollHeight; el.style.height = height + 'px';"],
		['a read in the written value', "el.style.height = el.scrollHeight + 'px';"],
		['a read alone', 'log(el.offsetWidth);'],
		['a discarded read', "el.classList.add('a'); void el.offsetHeight; el.classList.add('b');"],
		[
			'a read after a deliberate flush',
			"el.classList.add('a'); el.offsetHeight; log(el.offsetTop);",
		],
		[
			'a loop that flushes after its write',
			'for (const item of items) { log(el.offsetWidth); el.style.width = item; void el.offsetWidth; }',
		],
		[
			'a read in the other branch',
			"if (items) { el.style.width = '1px'; } else { log(el.offsetWidth); }",
		],
		[
			'a read after a branch that returns',
			"if (items) { el.style.width = '1px'; return; } log(el.offsetWidth);",
		],
		[
			'a read after an await',
			"(async () => { el.style.width = '1px'; await ready(); log(el.offsetWidth); })();",
		],
		[
			'a read in a callback',
			"el.style.width = '1px'; const read = () => el.offsetWidth; later(read);",
		],
		['a scroll assignment', "el.style.width = '1px'; el.scrollTop = 0;"],
		[
			'a read in a for initializer',
			"for (let i = 0, width = el.offsetWidth; i < 3; i++) { el.style.width = width + i + 'px'; }",
		],
		[
			'a read in the iterated value',
			"for (const item of items.slice(el.clientWidth)) { el.style.width = item + 'px'; }",
		],
		[
			'a write to an element that is not rendered',
			"const box = document.createElement('div'); box.style.width = '1px'; log(el.offsetWidth);",
		],
		['a member that is not layout', "el.style.width = '1px'; log(el.id, el.dataset.key);"],
	])('does not report %s', (_label, body) => {
		expect(hints(body)).toBe('');
	});

	// `r` is a rendered <div>; `box` belongs to a component, which may not render an element.
	it.each([
		['a write through a component ref', "box.current.style.width = '1px'; log(el.offsetWidth);"],
		['a read through a component ref', "el.style.width = '1px'; log(box.current.offsetWidth);"],
	])('does not report %s', (_label, body) => {
		const source = `"use strong";\n${IMPORTS}export function App() {
  const r = useRef(null);
  const box = useRef(null);
  useEffect(() => { const el = r.current; ${body} });
  return <div ref={r}><Box ref={box} /></div>;
}`;
		expect(found(source)).toEqual([]);
	});
});
