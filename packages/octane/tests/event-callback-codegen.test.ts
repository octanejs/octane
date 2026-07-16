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

		expect(code).toMatch(/const escaped = [_$a-zA-Z]*useCallback\(/);
		expect(code).toMatch(/const spreadEvent = [_$a-zA-Z]*useCallback\(/);
	});

	it('keeps callbacks live for hot replacement', () => {
		const code = compile(SOURCE, 'event-callbacks-hmr.tsrx', {
			hmr: true,
			dev: true,
		}).code;
		expect(code).toContain('useCallback');
		expect(code).toMatch(/\bconst singleton\b/);
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
		const assignments = (code: string) => code.match(/\["\$\$click"\] = \(event\)/g)?.length ?? 0;

		// The old installed wrapper reads the same committed cell, so an isolated
		// native slot needs no per-render write. A spread can overwrite that slot,
		// therefore the explicit event remains live to reassert JSX source order.
		expect(assignments(mountOnly)).toBe(1);
		expect(assignments(spreadShared)).toBe(2);
	});
});
