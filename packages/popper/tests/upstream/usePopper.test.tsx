/** @jsxImportSource octane */
import type { Instance, State } from '@popperjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsePopperHarness } from '../runtime/_fixtures/Harness.tsrx';
import { createRootTracker, settle } from './_helpers';

const { tracked, cleanup } = createRootTracker();
afterEach(function cleanupUsePopperSuite() {
	cleanup();
	vi.restoreAllMocks();
});

function fakeState(reference: Element, popper: HTMLElement, arrow?: HTMLElement): State {
	return {
		placement: 'bottom',
		orderedModifiers: [],
		options: { placement: 'bottom', modifiers: [], strategy: 'absolute' },
		modifiersData: {},
		elements: { reference, popper, ...(arrow ? { arrow } : {}) },
		attributes: { popper: { 'data-popper-placement': 'bottom' } },
		styles: {
			popper: { position: 'absolute', transform: 'translate(4px, 8px)' },
			...(arrow ? { arrow: { position: 'absolute', transform: 'translate(2px, 0px)' } } : {}),
		},
		scrollParents: { reference: [], popper: [] },
		rect: {
			reference: { x: 0, y: 0, width: 10, height: 10 },
			popper: { x: 4, y: 8, width: 5, height: 5 },
		},
		reset: false,
	} as State;
}

function oracle() {
	const instances: Instance[] = [];
	const createPopper = vi.fn(function createPopperMock(
		reference: Element,
		popper: HTMLElement,
		options: any,
	) {
		const arrow = options.modifiers.find(function findArrow(modifier: any) {
			return modifier.name === 'arrow';
		})?.options?.element as HTMLElement | undefined;
		const state = fakeState(reference, popper, arrow);
		const instance = {
			state,
			setOptions: vi.fn(async function setOptions() {
				return state;
			}),
			forceUpdate: vi.fn(function forceUpdate() {
				return state;
			}),
			update: vi.fn(async function update() {
				return state;
			}),
			destroy: vi.fn(),
		} as unknown as Instance;
		instances.push(instance);
		const updateState = options.modifiers.find(function findUpdateState(modifier: any) {
			return modifier.name === 'updateState';
		});
		queueMicrotask(function runUpdateState() {
			updateState.fn({ state, instance, options, name: 'updateState' });
		});
		return instance;
	});
	return { createPopper, instances };
}

// Ported from packages/popper/upstream/tag/src/usePopper.test.js
describe('usePopper', function usePopperSuite() {
	it('initializes the Popper instance', async function initializesThePopperInstance() {
		const reference = document.createElement('div');
		const popper = document.createElement('div');
		const mock = oracle();
		const root = tracked(UsePopperHarness, {
			referenceElement: reference,
			popperElement: popper,
			createPopper: mock.createPopper,
		});
		settle();
		await Promise.resolve();
		settle();
		expect(mock.createPopper).toHaveBeenCalledTimes(1);
		expect(root.find('#result').getAttribute('data-state')).toBe('bottom');
	});

	it("doesn't update Popper instance on props update if not needed by Popper", async function doesNotUpdateWhenNotNeeded() {
		const reference = document.createElement('div');
		const popper = document.createElement('div');
		const mock = oracle();
		const props = {
			referenceElement: reference,
			popperElement: popper,
			createPopper: mock.createPopper,
		};
		const root = tracked(UsePopperHarness, props);
		settle();
		root.update(UsePopperHarness, props);
		settle();
		await Promise.resolve();
		settle();
		expect(mock.createPopper).toHaveBeenCalledTimes(1);
	});

	it('updates Popper on explicitly listed props change', async function updatesOnListedPropsChange() {
		const reference = document.createElement('div');
		const firstPopper = document.createElement('div');
		const secondPopper = document.createElement('div');
		const mock = oracle();
		const props = {
			referenceElement: reference,
			popperElement: firstPopper,
			createPopper: mock.createPopper,
		};
		const root = tracked(UsePopperHarness, props);
		settle();
		root.update(UsePopperHarness, { ...props, popperElement: secondPopper });
		settle();
		await Promise.resolve();
		settle();
		expect(mock.createPopper).toHaveBeenCalledTimes(2);
	});

	it('does not update Popper on generic props change', async function doesNotUpdateOnGenericPropsChange() {
		const reference = document.createElement('div');
		const popper = document.createElement('div');
		const mock = oracle();
		const props = {
			referenceElement: reference,
			popperElement: popper,
			createPopper: mock.createPopper,
		};
		const root = tracked(UsePopperHarness, props);
		settle();
		const initialSetOptionsCalls = (mock.instances[0].setOptions as any).mock.calls.length;
		root.update(UsePopperHarness, { ...props, options: { foo: 'bar' } });
		settle();
		await Promise.resolve();
		settle();
		expect(mock.createPopper).toHaveBeenCalledTimes(1);
		expect((mock.instances[0].setOptions as any).mock.calls.length).toBe(initialSetOptionsCalls);
	});

	it('destroys Popper on instance on unmount', async function destroysOnUnmount() {
		const reference = document.createElement('div');
		const popper = document.createElement('div');
		const mock = oracle();
		const root = tracked(UsePopperHarness, {
			referenceElement: reference,
			popperElement: popper,
			createPopper: mock.createPopper,
		});
		settle();
		await Promise.resolve();
		settle();
		root.unmount();
		cleanup();
		expect(mock.instances[0].destroy).toHaveBeenCalled();
	});

	it('Initializes the arrow positioning', async function initializesArrowPositioning() {
		const reference = document.createElement('div');
		const popper = document.createElement('div');
		const arrow = document.createElement('div');
		const mock = oracle();
		const root = tracked(UsePopperHarness, {
			referenceElement: reference,
			popperElement: popper,
			createPopper: mock.createPopper,
			placement: 'bottom',
			modifiers: [{ name: 'arrow', options: { element: arrow } }],
		});
		settle();
		expect(root.find('#result').getAttribute('data-arrow-position')).toBe('absolute');
		expect(root.find('#result').getAttribute('data-arrow-transform')).toBe('undefined');
		await Promise.resolve();
		settle();
		expect(root.find('#result').getAttribute('data-arrow-transform')).toBe('translate(2px, 0px)');
	});
});
