import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

describe('layout snapshots in Strong mode', () => {
	it('allows committed ref reads and an options object', () => {
		const source = `"use strong";
import { useLayoutSnapshot, useRef } from 'octane';
export function App() @{
  const ref = useRef(null);
  const height = useLayoutSnapshot(() => ref.current?.offsetHeight, { initial: 0 });
  <div ref={ref}>{height as number}</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it.each([
		["import { useLayoutSnapshot as measure } from 'octane';", 'measure'],
		["import * as Octane from 'octane';", 'Octane.useLayoutSnapshot'],
	])('rejects synchronous state writes in the measurement callback', (imports, hook) => {
		const source = `"use strong";
${imports}
import { useState } from 'octane';
export function App() @{
  const [value, setValue] = useState(0);
  const measured = ${hook}(() => { setValue(1); return 1; });
  <div>{value + measured as number}</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).toThrow('OCTANE_STRONG_EFFECT_STATE_UPDATE');
	});

	it('rejects a state write in the equality callback', () => {
		const source = `"use strong";
import { useLayoutSnapshot, useState } from 'octane';
export function App() @{
  const [value, setValue] = useState(0);
  const measured = useLayoutSnapshot(() => value, {
    initial: 0,
    equal: (previous, next) => { setValue(next); return previous === next; },
  });
  <div>{measured as number}</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).toThrow('OCTANE_STRONG_EFFECT_STATE_UPDATE');
	});

	it('tracks an equality callback through local option aliases and spreads', () => {
		const source = `"use strong";
import { useLayoutSnapshot, useState } from 'octane';
export function App() @{
  const [value, setValue] = useState(0);
  const equal = (previous, next) => { setValue(next); return previous === next; };
  const options = { equal };
  const copied = { ...options, initial: 0 };
  const measured = useLayoutSnapshot(() => value, copied);
  <div>{measured as number}</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).toThrow('OCTANE_STRONG_EFFECT_STATE_UPDATE');
	});

	it('treats a returned function as snapshot data, not effect cleanup', () => {
		const source = `"use strong";
import { useLayoutSnapshot } from 'octane';
export function App() @{
  const measured = useLayoutSnapshot(() => () => {});
  <div>{String(measured) as string}</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('rejects resources acquired by measurement that cannot be cleaned up', () => {
		const source = `"use strong";
import { useLayoutSnapshot } from 'octane';
export function App() @{
  const measured = useLayoutSnapshot(() => {
    const onResize = () => {};
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });
  <div>{String(measured) as string}</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).toThrow('OCTANE_STRONG_EFFECT_RESOURCE_LEAK');
		// The returned function is the snapshot, so cleanup advice would be wrong.
		expect(() => compile(source, '/src/App.tsrx')).toThrow(
			'Its return value is the snapshot, not cleanup',
		);
	});

	it('explains that a measurement cannot cancel a promise continuation', () => {
		const source = `"use strong";
import { useLayoutSnapshot, useState } from 'octane';
export function App(props) @{
  const [data, setData] = useState(null);
  const measured = useLayoutSnapshot(() => {
    fetch(props.url).then((response) => setData(response));
    return 1;
  });
  <div>{String(data) + measured as string}</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).toThrow('OCTANE_STRONG_EFFECT_DATA_FETCH');
		expect(() => compile(source, '/src/App.tsrx')).toThrow(
			'it cannot return cleanup that cancels the update',
		);
	});

	it.each([
		['an async', 'async () => 1'],
		['a generator', 'function* () { yield 1; }'],
	])('rejects %s measurement that can never converge', (_kind, measure) => {
		const source = `"use strong";
import { useLayoutSnapshot } from 'octane';
export function App() @{
  const measured = useLayoutSnapshot(${measure});
  <div>{String(measured) as string}</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).toThrow('OCTANE_STRONG_LAYOUT_SNAPSHOT_ASYNC');
	});

	it('keeps a synchronous measurement that awaits nothing legal', () => {
		const source = `"use strong";
import { useLayoutSnapshot, useRef } from 'octane';
export function App() @{
  const ref = useRef(null);
  const measured = useLayoutSnapshot(function () { return ref.current?.offsetWidth ?? 0; }, {
    initial: 0,
  });
  <div ref={ref}>{measured as number}</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).not.toThrow();
	});

	it('rejects pre-paint scheduled state writes from measurement', () => {
		const source = `"use strong";
import { useLayoutSnapshot, useState } from 'octane';
export function App() @{
  const [value, setValue] = useState(0);
  const measured = useLayoutSnapshot(() => { queueMicrotask(() => setValue(1)); return value; });
  <div>{measured as number}</div>
}`;
		expect(() => compile(source, '/src/App.tsrx')).toThrow('OCTANE_STRONG_EFFECT_STATE_UPDATE');
	});
});

describe('layout snapshots on unsupported renderer targets', () => {
	const source = `import { useLayoutSnapshot } from 'octane';
export function App() @{ const value = useLayoutSnapshot(() => 1); <div>{value as number}</div> }`;

	it.each([
		['universal', { id: 'object', module: 'octane/universal', target: 'universal' }],
		[
			'Valdi',
			{
				id: 'native',
				module: '@test/valdi-writer',
				target: 'valdi',
				server: 'unsupported',
				text: 'reject',
			},
		],
	] as const)('rejects %s with a named diagnostic', (_name, renderer) => {
		expect(() => compile(source, '/src/App.tsrx', { renderer, hmr: false })).toThrow(
			/useLayoutSnapshot.*(?:universal renderer implementation|Valdi writer implementation)/,
		);
	});
});
