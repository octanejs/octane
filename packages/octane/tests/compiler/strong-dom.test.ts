import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile.js';
import { slotHooks } from '../../src/compiler/slot-hooks.js';
import { compileToVolarMappings } from '../../src/compiler/volar.js';

const MANAGED_DOM_WRITE = 'OCTANE_STRONG_MANAGED_DOM_WRITE';
const RAW_HTML_WRITE = 'OCTANE_STRONG_RAW_HTML_WRITE';
const OWN_MARKUP_QUERY = 'OCTANE_STRONG_OWN_MARKUP_QUERY';

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
		expectStrongError(source, '/src/App.tsx', MANAGED_DOM_WRITE);
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
		expectStrongError(effect(write, element), '/src/App.tsx', RAW_HTML_WRITE);
	});

	it('names the replacement in each message', () => {
		expect(
			messageOf(
				effect('r.current.innerHTML = html;', '<div ref={r} />'),
				'/src/App.tsx',
				RAW_HTML_WRITE,
			),
		).toContain('dangerouslySetInnerHTML={trustHTML(html)}');
		expect(
			messageOf(
				effect('r.current.textContent = label;', '<p ref={r}>{label}</p>'),
				'/src/App.tsx',
				MANAGED_DOM_WRITE,
			),
		).toContain('Render the content as its children from state or props');
		expect(
			messageOf(
				effect("r.current.className = 'on';", '<p ref={r} className="base" />'),
				'/src/App.tsx',
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
			'/src/App.tsx',
			MANAGED_DOM_WRITE,
		);
		expectStrongError(
			`${IMPORTS}export function App({ on }) {
  const r = useRef(null);
  useLayoutEffect(() => { r.current.classList.add(on ? 'on' : 'off'); });
  return <p ref={r} className="base" />;
}`,
			'/src/App.tsx',
			MANAGED_DOM_WRITE,
		);
		expectStrongError(
			`export function App({ label }) {
  return <p ref={(element) => { if (element) element.textContent = label; }}>{label}</p>;
}`,
			'/src/App.tsx',
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
			'/src/App.tsx',
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
		expect(errors(source, '/src/App.tsx')).toContainEqual(
			expect.objectContaining({
				code: MANAGED_DOM_WRITE,
				start: expect.objectContaining({ offset: start }),
				end: expect.objectContaining({ offset: start + 'r.current.textContent'.length }),
			}),
		);
		expect(() => compile(source, '/src/App.tsx')).toThrow(
			/App\.tsx:5:\d+: \[OCTANE_STRONG_MANAGED_DOM_WRITE\]/,
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
			'a ref attached in a mapped callback',
			'r.current.textContent = label;',
			'<ul>{[1, 2].map((n) => <li key={n} ref={r}>{n}</li>)}</ul>',
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
		expectStrongValid(source, '/src/App.tsx');
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
			'/src/App.tsx',
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
			const standard = compile(source, '/src/Ticker.tsx', { mode });
			const strong = compile(source, '/src/Ticker.tsx', { mode, strong: true } as any);
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
		expectStrongError(query(call, element), '/src/App.tsx', OWN_MARKUP_QUERY);
	});

	it('follows document aliases, event handlers, and .tsrx @for rows', () => {
		expectStrongError(
			`const doc = document;
export function App() {
  return <button id="save" onClick={() => doc.getElementById('save').blur()}>Save</button>;
}`,
			'/src/App.tsx',
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
			'/src/App.tsx',
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
		expectStrongValid(query(call, element), '/src/App.tsx');
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
			'/src/App.tsx',
		);
	});
});
