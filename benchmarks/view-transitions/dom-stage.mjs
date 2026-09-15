// Deterministic adapter work; public host-state tests separately cover the renderer.
// node benchmarks/view-transitions/dom-stage.mjs --octane-revision=<commit>
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from '../../test-utils/playwright-browser.ts';
import { openStagePage } from '../../packages/octane/tests/browser/view-transition-host-state/harness.ts';
import { octanePackageAt, parseOptions } from '../activity/harness.mjs';

const revision = parseOptions(process.argv.slice(2)).revision;
const selected = octanePackageAt(revision);
const hash = (input) => createHash('sha256').update(input).digest('hex');
const browser = await launchBrowser({ headless: true });
const page = await openStagePage(browser, selected.packageRoot);
// Closing the browser aborts a stuck page evaluation, including a bad sibling walk.
const timeout = setTimeout(() => void browser.close(), 30000);
const output = {
	suite: 'view-transition-dom-stage-work',
	metadata: {
		revision: selected.revision,
		workingTree: revision === undefined,
		adapterSha256: hash(fs.readFileSync(path.join(selected.packageRoot, 'src/dom-stage.ts'))),
		fixtureSha256: hash(fs.readFileSync(new URL(import.meta.url))),
		node: process.version,
		chromium: browser.version(),
	},
	cases: {},
};
try {
	for (const size of [256, 1024]) {
		output.cases[`structure-${size}`] = await page.evaluate((size) => {
			const parent = document.createElement('div');
			parent.innerHTML = '<i>retained</i>'.repeat(size);
			const originals = [...parent.childNodes];
			const added = Array.from({ length: size }, () => document.createElement('b'));
			const stage = new window.OctaneStage.DOMStage();
			const view = stage.view(parent);
			const work = { copiedNodeSlots: 0, searchedNodeSlots: 0, removedHosts: 0, clearedParents: 0 };
			const slice = Array.prototype.slice;
			const indexOf = Array.prototype.indexOf;
			const removeChild = Node.prototype.removeChild;
			const textContent = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
			Array.prototype.slice = function (...args) {
				const result = Reflect.apply(slice, this, args);
				if (this[0] instanceof Node) work.copiedNodeSlots += result.length;
				return result;
			};
			Array.prototype.indexOf = function (...args) {
				const result = Reflect.apply(indexOf, this, args);
				if (this[0] instanceof Node)
					work.searchedNodeSlots += result < 0 ? this.length : result + 1;
				return result;
			};
			Node.prototype.removeChild = function (child) {
				work.removedHosts++;
				return Reflect.apply(removeChild, this, [child]);
			};
			Object.defineProperty(Node.prototype, 'textContent', {
				...textContent,
				set(value) {
					work.clearedParents++;
					return Reflect.apply(textContent.set, this, [value]);
				},
			});
			let valid;
			try {
				for (const node of added) view.appendChild(stage.created(node));
				let index = 0;
				valid = true;
				for (let node = view.firstChild; node !== null; node = stage.view(node).nextSibling)
					valid &&= node === (index < size ? originals[index++] : added[index++ - size]);
				valid &&= index === 2 * size && parent.childNodes.length === size;
				stage.commit();
				valid &&= parent.childNodes.length === 2 * size && parent.firstChild === originals[0];
				const clear = new window.OctaneStage.DOMStage();
				clear.view(parent).textContent = '';
				valid &&= parent.childNodes.length === 2 * size && clear.view(parent).firstChild === null;
				clear.commit();
				valid &&= parent.childNodes.length === 0;
			} finally {
				Array.prototype.slice = slice;
				Array.prototype.indexOf = indexOf;
				Node.prototype.removeChild = removeChild;
				Object.defineProperty(Node.prototype, 'textContent', textContent);
			}
			return { valid, retainedHosts: size, insertedHosts: size, ...work };
		}, size);
		assert.equal(output.cases[`structure-${size}`].valid, true);
	}
	output.cases['radio-projection'] = await page.evaluate(() => {
		const background = document.createElement('main');
		background.innerHTML =
			'<p>unrelated</p>'.repeat(1024) +
			'<form>' +
			'<input type="radio" name="choice">'.repeat(24) +
			'</form>';
		document.body.appendChild(background);
		const form = background.querySelector('form');
		const radios = [...form.elements];
		const stage = new window.OctaneStage.DOMStage();
		const importNode = Document.prototype.importNode;
		const createElementNS = Document.prototype.createElementNS;
		const work = { importedNodes: 0, createdElements: 0 };
		Document.prototype.importNode = function (...args) {
			work.importedNodes++;
			return Reflect.apply(importNode, this, args);
		};
		Document.prototype.createElementNS = function (...args) {
			work.createdElements++;
			return Reflect.apply(createElementNS, this, args);
		};
		let valid = true;
		try {
			stage.view(radios[0]).checked = true;
			for (const radio of radios) {
				valid &&= stage.view(radio).form === form;
				valid &&= stage.view(form).elements.length === radios.length;
			}
			valid &&= radios.every((radio) => !radio.checked);
			stage.commit();
			valid &&= radios[0].checked && radios.slice(1).every((radio) => !radio.checked);
		} finally {
			Document.prototype.importNode = importNode;
			Document.prototype.createElementNS = createElementNS;
			background.remove();
		}
		return {
			valid,
			controls: radios.length,
			associationReads: 48,
			backgroundElements: 1024,
			...work,
		};
	});
	assert.equal(output.cases['radio-projection'].valid, true);
	output.cases['created-template'] = await page.evaluate(() => {
		const fragment = document.createDocumentFragment();
		const root = document.createElement('div');
		root.innerHTML =
			'<section><i>ordinary</i></section>'.repeat(1024) +
			'<template><b>outer</b><template><strong>inner</strong></template></template>';
		fragment.appendChild(root);
		const childNodes = Object.getOwnPropertyDescriptor(Node.prototype, 'childNodes');
		let childCollectionReads = 0;
		Object.defineProperty(Node.prototype, 'childNodes', {
			...childNodes,
			get() {
				childCollectionReads++;
				return Reflect.apply(childNodes.get, this, []);
			},
		});
		let valid;
		try {
			const stage = new window.OctaneStage.DOMStage();
			stage.created(fragment);
			const template = root.querySelector('template');
			const nested = template.content.querySelector('template');
			stage.view(nested.content.firstElementChild).textContent = 'prepared';
			valid = nested.content.firstElementChild.textContent === 'prepared';
			stage.commit();
		} finally {
			Object.defineProperty(Node.prototype, 'childNodes', childNodes);
		}
		return { valid, ordinaryElements: 2049, templateElements: 2, childCollectionReads };
	});
	assert.equal(output.cases['created-template'].valid, true);
	console.log(JSON.stringify(output, null, 2));
} finally {
	clearTimeout(timeout);
	await page.close();
	await browser.close();
}
