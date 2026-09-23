import { describe, it, expect } from 'vitest';
import { flushSync, hydrateRoot, useState } from 'octane';
import { renderToString } from 'octane/server';
import { mount } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture.js';

// A `.tsrx` module is not TS-transformed after Octane, so the enum and
// namespace declarations in this very file must reach Vite as plain JavaScript.
// Before the compiler lowered them, this file failed to load. Parameter
// properties are covered through compiled source strings below: @tsrx/core's
// type-check mapping cannot read them in a checked `.tsrx` file yet.

enum Direction {
	Up = 1,
	Down,
	Left = Up << 4,
	Right = Left | Down,
}

enum Tone {
	Quiet = 'quiet',
	Loud = `${Quiet}-loud`,
}

namespace Copy {
	export const greeting = 'hi';
	export function shout(value: string) {
		return value.toUpperCase() + suffix;
	}
	const suffix = '!';
}

function Compass() @{
	const [turns, setTurns] = useState(0);
	<button class={Tone.Loud} onClick={() => setTurns(turns + 1)}>
		{Copy.shout(Copy.greeting) + Direction[Direction.Right] + ':' +
			(Direction.Down + turns * Direction.Left)}
	</button>
}

describe('TypeScript runtime declarations in a .tsrx module', () => {
	it('renders and updates with enum and namespace values', () => {
		const r = mount(Compass);
		const button = r.find('button');
		expect(button.className).toBe('quiet-loud');
		expect(button.textContent).toBe('HI!Right:2');
		r.click('button');
		expect(button.textContent).toBe('HI!Right:18');
		r.unmount();
	});

	it('server-renders and hydrates the same declarations', () => {
		const source = `
			enum Step { One = 1, Two, Four = Two * 2 }
			namespace Copy { export const greeting = 'hi'; }
			class Label { constructor(private readonly prefix: string) {} text(v: string) { return this.prefix + v; } }
			export function App(props: { tone: string }) @{
				const label = new Label('#');
				<p class={props.tone}>{(label.text(Copy.greeting) + Step[Step.Four] + Step.Two) as string}</p>
			}
		`;
		const id = '/src/TypeScriptRuntimeDeclarations.tsrx';
		const server = loadCompiledFixtureSource(source, { id, mode: 'server' });
		const client = loadCompiledFixtureSource(source, { id, mode: 'client' });
		const container = document.createElement('div');
		document.body.append(container);
		try {
			container.innerHTML = renderToString(server.App, { tone: 'quiet' }).html;
			const p = container.querySelector('p')!;
			expect(p.className).toBe('quiet');
			expect(p.textContent).toBe('#hiFour2');
			const root = hydrateRoot(container, client.App, { tone: 'quiet' });
			flushSync(() => {});
			expect(container.querySelector('p')).toBe(p);
			expect(p.textContent).toBe('#hiFour2');
			root.unmount();
		} finally {
			container.remove();
		}
	});
});
