import assert from 'node:assert/strict';
import { fork, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyEvidence } from './evidence.mjs';

const repo = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(path.join(repo, 'package.json'));
const directoryArg = process.argv.find((arg) => arg.startsWith('--build-dir='));
assert.ok(directoryArg, 'Pass --build-dir= from run.mjs --build-only');
const directory = path.resolve(directoryArg.slice('--build-dir='.length));
const manifestSha256 = verifyEvidence(repo, directory);
const childArg = process.argv.find((arg) => arg.startsWith('--child='));

if (childArg) {
	const [variant, timing] = childArg.slice('--child='.length).split('-');
	assert.ok(['baseline', 'candidate'].includes(variant));
	assert.ok(['before', 'after'].includes(timing));
	const origin = process.env.OCTANE_STREAM_TEST_ORIGIN;
	assert.ok(origin);
	const name = `${variant}-${timing}`;
	const { JSDOM } = require('jsdom');
	const dom = new JSDOM(
		'<!doctype html><html><head></head><body><div id="root"></div></body></html>',
		{
			url: origin,
			runScripts: 'outside-only',
			pretendToBeVisual: true,
		},
	);
	const { window } = dom;
	const errors = [];
	for (const method of ['error', 'warn']) {
		console[method] = (...args) => errors.push(args.map(String).join(' '));
		window.console[method] = console[method];
	}
	window.addEventListener('error', (event) => errors.push(String(event.error ?? event.message)));
	for (const name of [
		'window',
		'document',
		'Node',
		'Element',
		'HTMLElement',
		'SVGElement',
		'DocumentFragment',
		'Text',
		'Comment',
		'Event',
		'MouseEvent',
		'CustomEvent',
		'MutationObserver',
		'NodeFilter',
		'HTMLInputElement',
		'HTMLTextAreaElement',
		'HTMLSelectElement',
		'HTMLOptionElement',
		'HTMLButtonElement',
		'Document',
		'navigator',
		'getComputedStyle',
		'requestAnimationFrame',
		'cancelAnimationFrame',
	]) {
		if (!(name in window)) continue;
		const bound = ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(
			name,
		);
		Object.defineProperty(globalThis, name, {
			configurable: true,
			writable: true,
			value: bound ? window[name].bind(window) : window[name],
		});
	}
	const rootElement = document.getElementById('root');
	const abort = new AbortController();
	let delivered = 0;
	let runtime;
	let responseBytes = '';
	const metrics = async () => {
		const response = await fetch(`${origin}/metrics?case=${name}`);
		assert.equal(response.status, 200);
		return response.json();
	};
	const control = async (action) => {
		const response = await fetch(`${origin}/control?case=${name}&action=${action}`, {
			method: 'POST',
		});
		assert.equal(response.status, 200);
	};
	const deliver = async () => {
		const state = await metrics();
		for (const chunk of state.chunks.slice(delivered)) {
			rootElement.insertAdjacentHTML('beforeend', chunk);
			// jsdom does not execute scripts inserted as HTML fragments. Run the actual
			// streamed scripts in order and remove them, as the existing SSR test does.
			for (const script of [...rootElement.querySelectorAll('script')]) {
				if (script.type === 'application/json' || script.src) continue;
				// Execute in the same Node realm as the emitted module: stream protocol
				// validation deliberately rejects plain objects from another realm.
				(0, eval)(script.textContent);
				for (const key of ['$OCTS', '$OCTRC', '$OCTRX', '$OCTRH', '$OCTVT']) {
					if (window[key]) globalThis[key] = window[key];
				}
				script.remove();
			}
			delivered++;
		}
		return state;
	};
	const waitFor = async (predicate, label) => {
		for (let index = 0; index < 400; index++) {
			const state = await deliver();
			if (predicate(state)) return state;
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		throw new Error(`Timed out waiting for ${label}`);
	};
	try {
		const progress = (step) => {
			if (process.env.OCTANE_STREAM_TEST_DEBUG) process.stderr.write(`${name}: ${step}\n`);
		};
		const response = await fetch(`${origin}/?case=${name}`, { signal: abort.signal });
		assert.equal(response.status, 200);
		const collecting = (async () => {
			const decoder = new TextDecoder();
			for await (const value of response.body)
				responseBytes += decoder.decode(value, { stream: true });
			responseBytes += decoder.decode();
		})();
		await waitFor(
			() => document.querySelector('output')?.textContent === 'A',
			'first server output',
		);
		progress('initial output');
		const nodes = Object.fromEntries(
			['main', 'h1', 'footer', 'output', 'input', 'button'].map((selector) => [
				selector,
				document.querySelector(selector),
			]),
		);
		nodes.input.value = 'browser draft';
		nodes.input.focus();
		let browserLoads = 0;
		let cleanup = 0;
		const second = 'B: streamed update';
		if (timing === 'before') {
			await control('next');
			await waitFor(
				(state) => state.chunks.some((chunk) => chunk.includes(second)),
				'second frame before activation',
			);
			progress('early frame');
			assert.equal(nodes.output.textContent, 'A');
		}
		const client = await import(pathToFileURL(path.join(directory, variant, 'entry.js')).href);
		runtime = client.start(rootElement, {
			async *load() {
				browserLoads++;
				yield 'unexpected browser result';
			},
			onCleanup() {
				cleanup++;
			},
		});
		progress('activated');
		if (timing === 'after') {
			assert.equal(nodes.output.textContent, 'A');
			await control('next');
		}
		const frameState = await waitFor(
			() => document.querySelector('output')?.textContent === second,
			'second server output',
		);
		progress('updated output');
		assert.ok(frameState.chunks.some((chunk) => chunk.includes(second)));
		for (const [selector, node] of Object.entries(nodes))
			assert.equal(document.querySelector(selector), node, selector);
		assert.equal(nodes.input.value, 'browser draft');
		assert.equal(document.activeElement, nodes.input);
		assert.equal(nodes.footer.textContent, 'Static sibling');
		assert.equal(browserLoads, 0);
		for (const expected of ['1', '2']) {
			nodes.button.click();
			for (let i = 0; i < 100 && nodes.button.textContent !== expected; i++) {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
			assert.equal(nodes.button.textContent, expected);
		}
		await control('end');
		progress('ending response');
		await collecting;
		progress('response ended');
		const state = await deliver();
		assert.equal(state.ended, true);
		assert.equal(state.loads, 1);
		assert.deepEqual(state.errors, []);
		assert.ok(state.chunks.join('').includes('"kind":"complete"'));
		runtime.root.unmount();
		await new Promise((resolve) => setTimeout(resolve, 0));
		runtime.hydration.dispose();
		runtime = undefined;
		assert.equal(cleanup, 1);
		assert.equal(document.querySelector('main'), null);
		assert.equal(
			responseBytes,
			'<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root">' +
				state.chunks.join('') +
				'</div></body></html>',
			'The delivered write chunks must exactly reconstruct the real HTTP response',
		);
		assert.deepEqual(errors, []);
		console.log(
			JSON.stringify({
				variant,
				timing,
				serverLoads: state.loads,
				clientLoads: browserLoads,
				identity: true,
				draft: true,
				focus: true,
				clicks: 2,
				cleanup,
				serverChunks: state.chunks.length,
				responseBytes: Buffer.byteLength(responseBytes),
			}),
		);
	} finally {
		runtime?.root.unmount();
		runtime?.hydration.dispose();
		abort.abort();
		dom.window.close();
	}
	// Node's HTTP client may keep idle sockets alive after the assertions finish.
	process.exit(0);
} else {
	for (const variant of ['baseline', 'candidate']) {
		const descriptor = path.join(directory, variant, 'package.json');
		if (!fs.existsSync(descriptor))
			fs.writeFileSync(descriptor, '{"type":"module"}\n', { flag: 'wx' });
		assert.equal(JSON.parse(fs.readFileSync(descriptor, 'utf8')).type, 'module');
	}
	const server = fork(path.join(directory, 'server.mjs'), [directory], {
		stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
	});
	let serverLog = '';
	server.stdout.on('data', (chunk) => {
		serverLog += String(chunk);
	});
	server.stderr.on('data', (chunk) => {
		serverLog += String(chunk);
	});
	try {
		const [message] = await Promise.race([
			once(server, 'message'),
			once(server, 'exit').then(([code]) => {
				throw new Error(`SSR process exited ${code}: ${serverLog}`);
			}),
			new Promise((_, reject) => {
				setTimeout(() => reject(new Error('SSR process did not listen')), 10000).unref();
			}),
		]);
		const origin = `http://127.0.0.1:${message.port}`;
		const results = [];
		for (const variant of ['baseline', 'candidate'])
			for (const timing of ['before', 'after']) {
				const child = spawnSync(
					process.execPath,
					[import.meta.filename, `--build-dir=${directory}`, `--child=${variant}-${timing}`],
					{
						encoding: 'utf8',
						timeout: 20000,
						env: { ...process.env, OCTANE_STREAM_TEST_ORIGIN: origin },
					},
				);
				assert.equal(
					child.status,
					0,
					`${variant}-${timing}: ${child.stderr || child.error || child.stdout}`,
				);
				results.push(JSON.parse(child.stdout));
			}
		const result = {
			node: process.version,
			jsdom: require('jsdom/package.json').version,
			manifestSha256,
			results,
			limitation:
				'Emitted ESM in isolated jsdom processes; renderer writes arrive via a metrics side channel and are manually inserted, inline scripts are evaluated in the Node realm, and jsdom reveal helpers are bridged. The HTTP response is collected separately and compared at the end. This is not a real-browser or native-input test.',
		};
		fs.writeFileSync(path.join(directory, 'jsdom.json'), JSON.stringify(result, null, 2) + '\n');
		console.log(JSON.stringify(result, null, 2));
	} finally {
		server.kill();
	}
}
