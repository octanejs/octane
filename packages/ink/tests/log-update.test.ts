import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import logUpdate from '../src/log-update.js';

const ESC = '\u001B';

const createOutput = () => {
	const writes: string[] = [];
	const stream = new EventEmitter() as unknown as NodeJS.WriteStream;
	stream.columns = 80;
	stream.isTTY = false;
	stream.write = ((chunk: string, callback?: () => void) => {
		writes.push(String(chunk));
		callback?.();
		return true;
	}) as NodeJS.WriteStream['write'];
	return { stream, writes };
};

const modes = [
	{ name: 'standard', incremental: false },
	{ name: 'incremental', incremental: true },
] as const;

describe.each(modes)('$name log updates', ({ incremental }) => {
	it.each([
		{
			name: 'ordinary multi-line output',
			output: 'one\ntwo',
			expected: `${ESC}[?25l${ESC}[1B${ESC}[1G${ESC}[1A${ESC}[3G${ESC}[?25h`,
		},
		{
			name: 'output with a trailing newline',
			output: 'one\ntwo\n',
			expected: `${ESC}[?25l${ESC}[2B${ESC}[1G${ESC}[1A${ESC}[3G${ESC}[?25h`,
		},
	])('byte-pins cursor-only updates for $name', ({ output, expected }) => {
		const { stream, writes } = createOutput();
		const render = logUpdate.create(stream, { incremental, showCursor: true });

		render.setCursorPosition({ x: 0, y: 0 });
		expect(render(output)).toBe(true);
		writes.length = 0;

		render.setCursorPosition({ x: 2, y: 1 });
		expect(render(output)).toBe(true);

		expect(writes).toEqual([expected]);
	});

	it.each(['create', 'clear', 'reset', 'done'] as const)(
		'preserves empty-frame geometry after %s',
		(state) => {
			const { stream, writes } = createOutput();
			const render = logUpdate.create(stream, { incremental, showCursor: true });

			if (state !== 'create') {
				render('seed');
				render[state]();
				writes.length = 0;
			}

			render.setCursorPosition({ x: 0, y: 0 });
			expect(render.willRender('')).toBe(true);
			expect(render('')).toBe(true);

			expect(writes).toEqual([`${ESC}[1A${ESC}[1G${ESC}[?25h`]);
		},
	);

	it('hides a previously shown cursor once, then treats the clean frame as unchanged', () => {
		const { stream, writes } = createOutput();
		const render = logUpdate.create(stream, { incremental, showCursor: true });
		const output = 'one\ntwo';

		render.setCursorPosition({ x: 1, y: 0 });
		expect(render(output)).toBe(true);
		writes.length = 0;

		expect(render.willRender(output)).toBe(true);
		expect(render(output)).toBe(true);
		expect(writes).toEqual([`${ESC}[?25l${ESC}[1B${ESC}[1G`]);

		writes.length = 0;
		expect(render.willRender(output)).toBe(false);
		expect(render(output)).toBe(false);
		expect(writes).toEqual([]);
	});

	it('uses synced output geometry for a later cursor-only update', () => {
		const { stream, writes } = createOutput();
		const render = logUpdate.create(stream, { incremental, showCursor: true });
		const output = 'one\ntwo\n';

		render.sync(output);
		render.setCursorPosition({ x: 2, y: 1 });
		expect(render.willRender(output)).toBe(true);
		expect(render(output)).toBe(true);

		expect(writes).toEqual([`${ESC}[1A${ESC}[3G${ESC}[?25h`]);
	});

	it('continues to render changed output', () => {
		const { stream, writes } = createOutput();
		const render = logUpdate.create(stream, { incremental, showCursor: true });

		expect(render('old\nframe')).toBe(true);
		writes.length = 0;
		expect(render.willRender('new\nframe')).toBe(true);
		expect(render('new\nframe')).toBe(true);

		expect(writes).toEqual([
			incremental
				? `${ESC}[1A${ESC}[1Gnew${ESC}[K\n`
				: `${ESC}[2K${ESC}[1A${ESC}[2K${ESC}[Gnew\nframe`,
		]);
	});
});
