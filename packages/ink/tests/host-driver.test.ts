import Yoga, { type Node as YogaNode } from 'yoga-layout';
import type { UniversalHostBatch, UniversalHostCommand } from 'octane/universal/native';
import { describe, expect, it, vi } from 'vitest';
import { createNode } from '../src/dom.js';
import { createInkContainer, createInkDriver, type InkHostContainer } from '../src/host-driver.js';

const batch = (version: number, commands: readonly UniversalHostCommand[]): UniversalHostBatch => ({
	renderer: 'ink',
	version,
	commands,
});

const context = {
	invokeLocalCallback: () => undefined,
};

describe('Ink host driver', () => {
	it('detaches text measurement callbacks before releasing Yoga nodes', () => {
		const measuredNodes = new WeakSet<YogaNode>();
		const violations: string[] = [];
		const containers: InkHostContainer[] = [];
		let releaseSite = 'unknown';
		let recording = true;
		const probeNode = Yoga.Node.create();
		const yogaPrototype = Object.getPrototypeOf(probeNode) as YogaNode;
		probeNode.freeRecursive();
		const setMeasureFunc = yogaPrototype.setMeasureFunc;
		const unsetMeasureFunc = yogaPrototype.unsetMeasureFunc;
		const free = yogaPrototype.free;
		const freeRecursive = yogaPrototype.freeRecursive;

		vi.spyOn(yogaPrototype, 'setMeasureFunc').mockImplementation(function (
			this: YogaNode,
			measureFunc: Parameters<YogaNode['setMeasureFunc']>[0],
		) {
			measuredNodes.add(this);
			return setMeasureFunc.call(this, measureFunc);
		});
		vi.spyOn(yogaPrototype, 'unsetMeasureFunc').mockImplementation(function (this: YogaNode) {
			measuredNodes.delete(this);
			return unsetMeasureFunc.call(this);
		});
		vi.spyOn(yogaPrototype, 'free').mockImplementation(function (this: YogaNode) {
			if (recording && measuredNodes.has(this)) violations.push(releaseSite);
			return free.call(this);
		});
		vi.spyOn(yogaPrototype, 'freeRecursive').mockImplementation(function (this: YogaNode) {
			if (recording && measuredNodes.has(this)) violations.push(releaseSite);
			return freeRecursive.call(this);
		});

		const createContainer = (): InkHostContainer => {
			const container = createInkContainer(createNode('ink-root'));
			containers.push(container);
			return container;
		};

		try {
			const nestedText = createContainer();
			releaseSite = 'nested text conversion';
			createInkDriver()
				.prepareBatch(
					nestedText,
					batch(1, [
						{ op: 'create', id: 1, type: 'ink-text', props: {} },
						{ op: 'create', id: 2, type: 'ink-text', props: {} },
						{ op: 'insert', parent: null, id: 1, before: null },
						{ op: 'insert', parent: 1, id: 2, before: null },
					]),
					context,
				)
				.apply();

			const destroyedText = createContainer();
			const destroyDriver = createInkDriver();
			destroyDriver
				.prepareBatch(
					destroyedText,
					batch(1, [
						{ op: 'create', id: 1, type: 'ink-text', props: {} },
						{ op: 'insert', parent: null, id: 1, before: null },
					]),
					context,
				)
				.apply();
			releaseSite = 'destroy';
			destroyDriver
				.prepareBatch(
					destroyedText,
					batch(2, [
						{ op: 'remove', parent: null, id: 1 },
						{ op: 'destroy', id: 1 },
					]),
					context,
				)
				.apply();

			const abortedText = createContainer();
			releaseSite = 'abort';
			createInkDriver()
				.prepareBatch(
					abortedText,
					batch(1, [{ op: 'create', id: 1, type: 'ink-text', props: {} }]),
					context,
				)
				.abort();

			expect(violations).toEqual([]);
		} finally {
			recording = false;
			for (const container of containers) {
				for (const node of container.instances.values()) node.yogaNode?.unsetMeasureFunc();
			}
			vi.restoreAllMocks();
			for (const container of containers) container.root.yogaNode?.freeRecursive();
		}
	});
});
