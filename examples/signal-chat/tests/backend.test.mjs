import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answer, history, session } from '../src/backend.ts';

function context(query) {
	return {
		request: new Request(`http://localhost/?${query}`),
		signal: new AbortController().signal,
	};
}

async function collect(stream) {
	const values = [];
	for await (const value of stream) values.push(value);
	return values;
}

test('history defaults to the number of turns', async () => {
	const request = context('run=default-rows&auth=0&history=0&interval=0&waves=1&turns=3');
	const config = await session(request);
	const frames = await collect(history(config, request));
	assert.equal(config.historyRows, 3);
	assert.deepEqual(
		frames.map((frame) => frame.rows.length),
		[3],
	);
	const blank = context('run=blank-rows&auth=0&turns=2&historyRows=');
	assert.equal((await session(blank)).historyRows, 2);
});

test('streams independently sized conversation and history workloads', async () => {
	const request = context(
		'run=independent-rows&auth=0&answer=0&history=0&interval=0&waves=2&turns=4&historyRows=2',
	);
	const config = await session(request);
	const input = { config, prompt: 'Hello', generation: 0 };
	const [answers, histories] = await Promise.all([
		collect(answer(input, request)),
		collect(history(config, request)),
	]);
	assert.deepEqual(
		answers.map((frame) => frame.messages.length),
		[8, 8],
	);
	assert.match(answers.at(-1).messages.at(-1).content, /Generation 0 complete\./);
	assert.deepEqual(
		histories.map((frame) => frame.rows.length),
		[1, 2],
	);
	assert.deepEqual(
		histories.at(-1).rows.map((row) => row.id),
		['history-1', 'history-2'],
	);
});
