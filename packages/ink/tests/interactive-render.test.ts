import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { render } from '../src/index.js';
import { BasicFixture } from './_fixtures/basic.ink.tsrx';

const createOutput = () => {
	const writes: string[] = [];
	const stream = new EventEmitter() as unknown as NodeJS.WriteStream;
	stream.columns = 20;
	stream.isTTY = false;
	stream.write = ((chunk: string, callback?: () => void) => {
		writes.push(String(chunk));
		callback?.();
		return true;
	}) as NodeJS.WriteStream['write'];
	return { stream, writes };
};

const createInput = () => {
	const stream = new EventEmitter() as unknown as NodeJS.ReadStream;
	stream.isTTY = false;
	stream.setEncoding = () => stream;
	stream.read = () => null;
	stream.ref = () => stream;
	stream.unref = () => stream;
	return stream;
};

describe('render', () => {
	it('writes the final frame and settles waitUntilExit on unmount', async () => {
		const stdout = createOutput();
		const stderr = createOutput();
		const app = render(
			BasicFixture,
			{ name: 'terminal' },
			{
				stdout: stdout.stream,
				stderr: stderr.stream,
				stdin: createInput(),
				interactive: false,
				patchConsole: false,
			},
		);

		await new Promise<void>((resolve) => setImmediate(resolve));
		await app.waitUntilRenderFlush();
		app.unmount();
		await app.waitUntilExit();

		expect(stdout.writes.join('')).toContain('[Hello terminal]');
		expect(stderr.writes).toEqual([]);
	});
});
