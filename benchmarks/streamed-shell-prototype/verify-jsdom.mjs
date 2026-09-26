import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = path.resolve(import.meta.dirname, '../..');
const require = createRequire(path.join(REPO, 'package.json'));
const argument = process.argv.find((value) => value.startsWith('--build-dir='));
assert.ok(argument, 'Pass --build-dir=/absolute/output from run.mjs');
const directory = path.resolve(argument.slice('--build-dir='.length));
const report = JSON.parse(fs.readFileSync(path.join(directory, 'report.json'), 'utf8'));
assert.equal(report.output, directory, 'Use the recorded build directory');
const childArgument = process.argv.find((value) => value.startsWith('--child='));

if (childArgument) {
	const name = childArgument.slice('--child='.length);
	const variant = report.variants.find((entry) => entry.variant === name);
	assert.ok(variant, `Unknown variant: ${name}`);
	for (const [file, expected] of Object.entries({ ...variant.files, ...variant.css })) {
		const actual = createHash('sha256')
			.update(fs.readFileSync(path.join(variant.clientDir, file)))
			.digest('hex');
		assert.equal(actual, expected.sha256, `Client asset changed: ${file}`);
	}
	const { JSDOM } = require('jsdom');
	const dom = new JSDOM(variant.document, { url: 'http://localhost/', pretendToBeVisual: true });
	const { window } = dom;
	const errors = [];
	for (const name of ['error', 'warn']) {
		console[name] = (...args) => errors.push(args.map(String).join(' '));
		window.console[name] = console[name];
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
		const method = ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(
			name,
		);
		Object.defineProperty(globalThis, name, {
			configurable: true,
			writable: true,
			value: method ? window[name].bind(window) : window[name],
		});
	}
	const shell = document.querySelector('[data-shell]');
	const button = document.querySelector('[data-increment]');
	const value = document.querySelector('[data-counter-value]');
	const sibling = document.querySelector('[data-static-sibling]');
	const summary = document.querySelector('[data-shell-summary]');
	button.focus();
	try {
		// The entry and its later dynamic import are the actual emitted ESM files.
		await import(pathToFileURL(path.join(variant.clientDir, 'entry.js')).href);
		assert.equal(document.documentElement.dataset.shellReady, 'true');
		assert.equal(document.querySelector('[data-shell]'), shell);
		assert.equal(document.querySelector('[data-increment]'), button);
		assert.equal(document.querySelector('[data-counter-value]'), value);
		assert.equal(document.querySelector('[data-static-sibling]'), sibling);
		assert.equal(sibling.textContent, 'Static sibling after the live child');
		assert.equal(document.querySelector('[data-shell-summary]'), summary);
		assert.equal(summary.textContent, 'A server-authored introduction for Ada.');
		assert.equal(document.activeElement, button);
		for (const expected of ['1', '2']) {
			button.click();
			for (let i = 0; i < 100 && value.textContent !== expected; i++) {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
			assert.equal(value.textContent, expected);
			assert.equal(document.querySelector('[data-shell]'), shell);
			assert.equal(document.querySelector('[data-increment]'), button);
			assert.equal(document.querySelector('[data-counter-value]'), value);
			assert.equal(document.activeElement, button);
		}
		assert.equal(window.__shellSharedLoads, 1);
		assert.equal(document.querySelector('[data-static-sibling]'), sibling);
		assert.equal(sibling.textContent, 'Static sibling after the live child');
		assert.equal(document.querySelector('[data-shell-summary]'), summary);
		assert.equal(summary.textContent, 'A server-authored introduction for Ada.');
		assert.equal(window.__shellOnlyEffectLoads ?? 0, variant.negativeControl ? 0 : 1);
		assert.deepEqual(
			Array.from(window.__shellEffectOrder),
			variant.negativeControl ? ['shared'] : ['shared', 'shell'],
		);
		assert.deepEqual(errors, []);
		console.log(
			JSON.stringify({
				variant: name,
				adopted: true,
				focus: true,
				value: value.textContent,
				staticSibling: true,
				sharedLoads: window.__shellSharedLoads,
				shellOnlyEffectLoads: window.__shellOnlyEffectLoads ?? 0,
				effectOrder: Array.from(window.__shellEffectOrder),
				negativeControl: variant.negativeControl,
			}),
		);
	} finally {
		dom.window.close();
	}
} else {
	const results = [];
	for (const variant of report.variants) {
		// Output is outside the repository; this makes Node load Vite's .js files
		// as ESM. Never overwrite an existing package descriptor.
		const packageFile = path.join(variant.clientDir, 'package.json');
		if (!fs.existsSync(packageFile))
			fs.writeFileSync(packageFile, '{"type":"module"}\n', { flag: 'wx' });
		assert.equal(JSON.parse(fs.readFileSync(packageFile, 'utf8')).type, 'module');
		const child = spawnSync(
			process.execPath,
			[import.meta.filename, `--build-dir=${directory}`, `--child=${variant.variant}`],
			{
				encoding: 'utf8',
				timeout: 20_000,
			},
		);
		assert.equal(
			child.status,
			0,
			`${variant.variant}: ${child.stderr || child.error || child.stdout}`,
		);
		results.push(JSON.parse(child.stdout));
	}
	const result = {
		node: process.version,
		jsdom: require('jsdom/package.json').version,
		results,
		limitation:
			'Actual emitted ESM in isolated jsdom processes; no browser network, CSS or native-input proof.',
	};
	fs.writeFileSync(path.join(directory, 'jsdom.json'), JSON.stringify(result, null, 2) + '\n');
	console.log(JSON.stringify(result, null, 2));
}
