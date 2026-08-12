/** @jsxImportSource octane */
import * as Popperjs from '@popperjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManagedPopperHarness, TransparentManagerHarness } from '../runtime/_fixtures/Harness.tsrx';
import { createRootTracker, settle } from './_helpers';

const { tracked, cleanup } = createRootTracker();
afterEach(function cleanupManagerSuite() {
	cleanup();
	vi.restoreAllMocks();
});

function elementChildren(container: HTMLElement): HTMLElement[] {
	return Array.from(container.childNodes).filter(function keepElements(node): node is HTMLElement {
		return node.nodeType === Node.ELEMENT_NODE;
	}) as HTMLElement[];
}

// Ported from packages/popper/upstream/tag/src/Manager.test.js
describe('Manager component', function managerSuite() {
	it('renders the expected markup', function rendersExpectedMarkup() {
		const root = tracked(TransparentManagerHarness, {});
		settle();
		const elements = elementChildren(root.container);
		expect(elements).toHaveLength(2);
		expect(elements[0].tagName).toBe('DIV');
		expect(elements[0].id).toBe('reference');
		expect(elements[1].tagName).toBe('DIV');
		expect(elements[1].id).toBe('popper');
	});

	it('connects Popper and Reference', async function connectsPopperAndReference() {
		const spy = vi.spyOn(Popperjs, 'createPopper');
		tracked(ManagedPopperHarness, {});
		settle();
		await Promise.resolve();
		settle();
		expect(spy).toHaveBeenCalled();
		expect(spy.mock.calls[0][0]).toBeInstanceOf(HTMLButtonElement);
		expect(spy.mock.calls[0][1]).toBeInstanceOf(HTMLDivElement);
	});
});
