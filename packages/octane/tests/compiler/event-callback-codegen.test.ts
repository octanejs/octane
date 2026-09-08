import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

const SOURCE = `
  import { useState } from 'octane';
  export function App() @{
    const [value, setValue] = useState(0);
    const singleton = () => setValue((current) => current + 1);
    const shared = () => setValue((current) => current + 2);
    <div>
      <button id="one" onClick={singleton}>one</button>
      <button id="two" onClick={shared}>two</button>
      <button id="three" onClick={() => shared()}>three</button>
      {value as string}
    </div>
  }
`;

describe('compiler-owned native event callbacks', () => {
	it('creates event-only callbacks in the production mount path', () => {
		const code = compile(SOURCE, 'event-callbacks.tsrx', {
			hmr: false,
			dev: false,
		}).code;

		// Raw output is supplemental here: the DOM test owns behavior, while this
		// protects the code-size property that no callback hook is emitted.
		expect(code).not.toContain('useCallback');
		expect(code).toMatch(/useState\(0, 0\)/);
		expect(code).not.toMatch(/const _h\$\d+ = \d+;/);
		expect(code).not.toMatch(/\bconst singleton\b/);
		expect(code.match(/\bconst shared\b/g)).toHaveLength(1);
		expect(code.match(/\bshared\b/g)).toHaveLength(3);
	});

	it('keeps the hook when a callback escapes or its event is not mount-only', () => {
		const code = compile(
			`
        import { useState } from 'octane';
        export function App(props) @{
          const [, setValue] = useState(0);
          const escaped = () => setValue((value) => value + 1);
          const spreadEvent = () => setValue((value) => value + 2);
          const attrs = {};
          props.observe(escaped);
          <button {...attrs} onClick={spreadEvent}>run</button>
        }
      `,
			'event-callback-escapes.tsrx',
			{ hmr: false, dev: false },
		).code;

		// Escaping / non-mount-only callbacks stay MEMOIZED (not demoted to a
		// mount-only event slot). Both authored bindings survive and each closure
		// has one allocation site, without depending on a private cache layout.
		expect(code).not.toContain('useCallback');
		expect(code).toMatch(/\b(?:const|let) escaped\b/);
		expect(code).toMatch(/\b(?:const|let) spreadEvent\b/);
		expect(code.match(/\(\) => setValue/g)).toHaveLength(2);
	});

	it('keeps callbacks live for hot replacement', () => {
		const code = compile(SOURCE, 'event-callbacks-hmr.tsrx', {
			hmr: true,
			dev: true,
		}).code;
		expect(code).toContain('useCallback');
		expect(code).toMatch(/\bconst singleton\b/);
	});

	it('validates direct dynamic listeners only in development output', () => {
		const source = `
      export function App(props) @{
        <div>
          <button onClick={props.onClick}>bubble</button>
          <button onClickCapture={props.onCapture}>capture</button>
          <button onDoubleClick="bad">static-invalid</button>
          <button onAuxClick>bare-invalid</button>
        </div>
      }
    `;
		const development = compile(source, 'event-listener-diagnostics.tsrx', {
			hmr: true,
			dev: true,
		}).code;
		const production = compile(source, 'event-listener-diagnostics.tsrx', {
			hmr: false,
			dev: false,
		}).code;

		expect(development).toContain('devEventListener as _$devEventListener');
		expect(development).toMatch(/_\$devEventListener\(["']onClick["'], \(?props\.onClick\)?\)/);
		expect(development).toMatch(
			/_\$devEventListener\(["']onClickCapture["'], \(?props\.onCapture\)?\)/,
		);
		expect(development).toMatch(/_\$devEventListener\(["']onDoubleClick["'], \(?["']bad["']\)?\)/);
		expect(development).toMatch(/_\$devEventListener\(["']onAuxClick["'], \(?true\)?\)/);
		expect(development).not.toContain('onDoubleClick=');
		expect(development).not.toContain('onAuxClick=');
		expect(development).not.toContain('<button onclick=');
		expect(production).not.toContain('devEventListener');
		// Production keeps the authored handlers without adding development
		// validation. Native listener behavior is covered by attrs-events and
		// invalid-listeners; neither contract depends on the write's lowering.
		expect(production).toContain('props.onClick');
		expect(production).toContain('props.onCapture');
		expect(production).not.toContain('onDoubleClick=');
		expect(production).not.toContain('onAuxClick=');
		expect(production).not.toContain('<button onclick=');
	});

	it('bundles only event arguments that survive being hoisted to render time', () => {
		const handler = (arg: string) =>
			compile(
				`
        import { useRef } from 'octane';
        export function App(props) @{
          const box = useRef(null);
          const { select, row, n, build, flag, key } = props;
          <button onClick={() => select(${arg})}>go</button>
        }
      `,
				'event-bundle-args.tsrx',
				{ hmr: false, dev: false },
			).code;
		const bundled = (arg: string) => /_\$evt\d+\(/.test(handler(arg));

		// Value-stable and cheap: what the expression yields at render time is
		// what it would have yielded at click time. A getter behind `row.id` or a
		// `valueOf` behind `n + 1` is the optimization's standing premise, so the
		// two are admitted on the same terms rather than one being refused.
		for (const arg of [
			'row',
			'row.id',
			'row?.id',
			"'go'",
			'!flag',
			'n + 1',
			'+n',
			'n < 1',
			'`row-${row.id}`',
			'row.id ?? n',
			'flag ? n : 0',
		])
			expect(bundled(arg)).toBe(true);

		// These break value stability outright: a call does unbounded, observable
		// work; a fresh array/object/regex allocates an identity that can never
		// compare equal; `++` mutates. `box.current` is the sharpest case — the
		// ref attaches AFTER the mount that would read it, so the first click
		// would receive the pre-attach `null`. Computed keys fail closed because
		// `box[key]` can spell `current` without saying so.
		for (const arg of [
			'build(n)',
			'[row]',
			'{ row }',
			'/x/g',
			'n++',
			'box.current',
			"box['current']",
			'box[key]',
			'row[n]',
		]) {
			expect(handler(arg)).toContain(`() => select(${arg})`);
			expect(bundled(arg)).toBe(false);
		}
	});

	it('installs an inline handler once only when nothing it reads can change', () => {
		// Reaches only module scope + a useState setter, so the slot never needs
		// rewriting; the capturing cases must keep their update write.
		const compileBody = (body: string, options = { hmr: false, dev: false }) =>
			compile(
				`
        import { useState, useRef, useEffectEvent } from 'octane';
        const label = () => 'x';
        export function App(props) @{
          ${body}
        }
      `,
				'inline-handler-lifetime.tsrx',
				options,
			).code;
		// Shape-independent: a handler the update path rewrites is EMITTED twice
		// (mount + update), whichever lowering carries it — closure assignment,
		// the bundle's `evtNu` helper, or a spread's source resolver.
		const emitCount = (code: string) => (code.match(/setLog\(|setN\(|ev\(\)/g) || []).length;
		const rewritesOnUpdate = (code: string) => /_\$evt\d+u\(/.test(code) || emitCount(code) > 1;

		const installedOnce = (body: string) => !rewritesOnUpdate(compileBody(body));

		// Nothing changeable is reachable: module function, useState setter,
		// useRef object (the arrow still reads `.current` at click time), and a
		// useEffectEvent wrapper that forwards to its latest committed body.
		expect(
			installedOnce(`
        const [, setLog] = useState('');
        <button onClick={() => setLog(label())}>go</button>
      `),
		).toBe(true);
		expect(
			installedOnce(`
        const [, setN] = useState(0);
        <button onClick={() => setN((current) => current + 1)}>go</button>
      `),
		).toBe(true);
		expect(
			installedOnce(`
        const box = useRef(null);
        const [, setLog] = useState('');
        <button onClick={() => setLog(box.current)}>go</button>
      `),
		).toBe(true);
		expect(
			installedOnce(`
        const ev = useEffectEvent(() => props.log(props.value));
        <button onClick={() => ev()}>go</button>
      `),
		).toBe(true);

		// Captures render state, so the slot must follow each render.
		expect(
			installedOnce(`
        const [n, setN] = useState(0);
        <button onClick={() => setN(n + 1)}>go</button>
      `),
		).toBe(false);
		// `props` is a component local that is not lifetime-invariant.
		expect(
			installedOnce(`
        const [, setLog] = useState('');
        <button onClick={() => setLog(props.value)}>go</button>
      `),
		).toBe(false);
		// A derived const is recomputed every render even though it is `const`.
		expect(
			installedOnce(`
        const [n, setN] = useState(0);
        const doubled = n * 2;
        <button onClick={() => setN(doubled)}>go</button>
      `),
		).toBe(false);

		// A direct `eval` resolves component locals the free-name walk cannot
		// see, so the handler must not be treated as reading only module scope.
		expect(
			installedOnce(`
        const [n, setN] = useState(0);
        <button onClick={() => setLog(eval('n'))}>go</button>
      `),
		).toBe(false);

		// Hot replacement has to be able to swap an edited handler body, and a
		// spread on the same element can overwrite the slot.
		expect(
			rewritesOnUpdate(
				compileBody(
					`
        const [, setLog] = useState('');
        <button onClick={() => setLog(label())}>go</button>
      `,
					{ hmr: true, dev: true },
				),
			),
		).toBe(true);
		expect(
			installedOnce(`
        const [, setLog] = useState('');
        <button {...props.attrs} onClick={() => setLog(label())}>go</button>
      `),
		).toBe(false);
	});

	it('keeps a keyed row handler live, where the item can change without a remount', () => {
		// `collectComponentLocals` does not descend into the row body, so an
		// unguarded lifetime proof would read `item` as module scope and freeze
		// the first item's capture into the surviving row's slot.
		const code = compile(
			`
        import { useState } from 'octane';
        export function App(props) @{
          const [, setPicked] = useState(null);
          <ul>
            @for (const item of props.items; key item.id) {
              <li><button onClick={() => setPicked(item.label)}>go</button></li>
            }
          </ul>
        }
      `,
			'keyed-row-handler.tsrx',
			{ hmr: false, dev: false },
		).code;

		const rowBody = code.slice(code.indexOf('function __item'));
		expect(rowBody).toContain('function __item');
		// `item.label` is a member path, so the row takes the bundle lowering;
		// the update helper is the proof its slot still follows the item.
		expect(rowBody).toMatch(/_\$evt\d+u\(/);
	});

	it('retains an Effect Event mount wrapper only for an unshared native event slot', () => {
		const source = (spread: string) => `
      import { useEffectEvent } from 'octane';
      export function App(props) @{
        const event = useEffectEvent(() => props.log(props.value));
        <button ${spread} onClick={event}>go</button>
      }
    `;
		const mountOnly = compile(source(''), 'effect-event-slot.tsrx', {
			hmr: false,
			dev: false,
		}).code;
		const spreadShared = compile(source('{...props.attrs}'), 'effect-event-spread-slot.tsrx', {
			hmr: false,
			dev: false,
		}).code;
		const authoredHandlerReferences = (code: string) => code.match(/\bevent\b/g)?.length ?? 0;

		// The old installed wrapper reads the same committed cell, so an isolated
		// native slot needs no per-render write. A spread can overwrite that slot,
		// therefore the final source resolver remains live on mount and update to
		// reassert JSX source order.
		// Count the authored declaration and its uses, independent of whether the
		// write is represented by a direct assignment or a runtime operation.
		expect(authoredHandlerReferences(mountOnly)).toBe(2);
		expect(authoredHandlerReferences(spreadShared)).toBe(3);
	});
});
