import { describe, expect, it, vi } from 'vitest';
import { flushSync } from 'octane';
import { Accessibility, DragDropManager, Feedback } from '@dnd-kit/dom';
import { CollisionPriority, Modifier } from '@dnd-kit/abstract';
import { KeyboardSensor, PointerSensor } from '@octanejs/dnd-kit';
import { isSortable, isSortableOperation } from '@octanejs/dnd-kit/sortable';
import { flushEffects, mount } from '../../../octane/tests/_helpers';
import {
	InteractionFixture,
	MonitorOutsideProvider,
	RegistryFixture,
	SortableFixture,
	StaticOverlayFixture,
} from '../_fixtures/core.tsrx';

type Manager = DragDropManager<any, any, any>;

class TestModifier extends Modifier {}

const collisionDetector = () => [];

async function settle(): Promise<void> {
	flushEffects();
	flushSync(() => {});
	await Promise.resolve();
	await Promise.resolve();
	flushEffects();
	flushSync(() => {});
}

function setRect(element: Element, rect: Partial<DOMRect> = {}): void {
	const value = {
		x: rect.x ?? rect.left ?? 0,
		y: rect.y ?? rect.top ?? 0,
		left: rect.left ?? rect.x ?? 0,
		top: rect.top ?? rect.y ?? 0,
		right: rect.right ?? (rect.left ?? rect.x ?? 0) + (rect.width ?? 40),
		bottom: rect.bottom ?? (rect.top ?? rect.y ?? 0) + (rect.height ?? 40),
		width: rect.width ?? 40,
		height: rect.height ?? 40,
		toJSON() {
			return this;
		},
	};
	vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(value as DOMRect);
}

async function keydown(element: EventTarget, code: string, key = code): Promise<void> {
	flushSync(() => {
		element.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code, key }),
		);
	});
	await settle();
}

async function waitForIdle(manager: Manager): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt++) {
		if (manager.dragOperation.status.idle) return;
		await settle();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	}
	expect(manager.dragOperation.status.idle).toBe(true);
}

describe('core registrations and provider lifecycle', () => {
	it('isolates repeated draggable and droppable hooks and updates identifiers', async () => {
		let manager: Manager | null = null;
		let instances: any;
		const props = {
			firstId: 'drag-one',
			firstDisabled: false,
			captureManager(value: Manager) {
				manager = value;
			},
			captureInstances(value: unknown) {
				instances = value;
			},
		};
		const mounted = mount(RegistryFixture, props);
		await settle();

		expect(manager).not.toBeNull();
		expect(manager!.registry.draggables.has('drag-one')).toBe(true);
		expect(manager!.registry.draggables.has('drag-two')).toBe(true);
		expect(manager!.registry.droppables.has('drop-one')).toBe(true);
		expect(manager!.registry.droppables.has('drop-two')).toBe(true);
		expect(instances.first.draggable).not.toBe(instances.second.draggable);
		expect(instances.firstDrop.droppable).not.toBe(instances.secondDrop.droppable);
		expect(instances.first.draggable.element).toBe(mounted.find('#drag-one'));
		expect(instances.first.draggable.handle).toBe(mounted.find('#drag-one-handle'));

		setRect(mounted.find('#drag-one'));
		await manager!.actions.start({ source: 'drag-one', coordinates: { x: 10, y: 10 } });
		await settle();
		expect(instances.first.isDragging).toBe(false);
		expect(instances.first.isDropping).toBe(false);
		expect(instances.first.isDragSource).toBe(true);
		const dragElement = instances.first.draggable.element;
		const dropElement = instances.firstDrop.droppable.element;
		instances.first.ref(null);
		instances.firstDrop.ref(null);
		expect(instances.first.draggable.element).toBe(dragElement);
		expect(instances.firstDrop.droppable.element).toBe(dropElement);
		manager!.actions.stop({ canceled: true });
		await waitForIdle(manager!);

		const explicitDragElement = document.createElement('article');
		const explicitDragHandle = document.createElement('button');
		const explicitDropElement = document.createElement('aside');

		mounted.update(RegistryFixture, {
			...props,
			firstId: 'drag-renamed',
			firstDisabled: true,
			firstData: { label: 'renamed' },
			firstElement: explicitDragElement,
			firstHandle: explicitDragHandle,
			firstSensors: [KeyboardSensor],
			firstModifiers: [TestModifier],
			firstPlugins: [Feedback],
			firstAlignment: { x: 'start', y: 'end' },
			dropAccept: ['renamed'],
			dropCollisionDetector: collisionDetector,
			dropData: { label: 'target' },
			dropDisabled: true,
			dropElement: explicitDropElement,
			dropType: 'renamed',
		});
		await settle();

		expect(manager!.registry.draggables.has('drag-one')).toBe(false);
		expect(manager!.registry.draggables.has('drag-renamed')).toBe(true);
		expect(manager!.registry.draggables.get('drag-renamed')?.disabled).toBe(true);
		expect(instances.first.draggable.data).toEqual({ label: 'renamed' });
		expect(instances.first.draggable.element).toBe(explicitDragElement);
		expect(instances.first.draggable.handle).toBe(explicitDragHandle);
		expect(instances.first.draggable.sensors).toEqual([KeyboardSensor]);
		expect(instances.first.draggable.modifiers).toEqual([TestModifier]);
		expect(instances.first.draggable.plugins).toEqual([Feedback]);
		expect(instances.first.draggable.alignment).toEqual({ x: 'start', y: 'end' });
		expect(instances.firstDrop.droppable.element).toBe(explicitDropElement);
		expect(instances.firstDrop.droppable.accept).toEqual(['renamed']);
		expect(instances.firstDrop.droppable.collisionDetector).toBe(collisionDetector);
		expect(instances.firstDrop.droppable.data).toEqual({ label: 'target' });
		expect(instances.firstDrop.droppable.disabled).toBe(true);
		expect(instances.firstDrop.droppable.type).toBe('renamed');

		mounted.unmount();
		expect([...manager!.registry.draggables]).toEqual([]);
		expect([...manager!.registry.droppables]).toEqual([]);
	});

	it('uses a supplied manager and applies provider plugin and sensor updates', async () => {
		const custom = new DragDropManager({ plugins: [], sensors: [], modifiers: [] });
		let captured: Manager | null = null;
		const base = {
			manager: custom,
			firstId: 'drag-one',
			firstDisabled: false,
			sensors: [],
			plugins: [],
			modifiers: [],
			captureManager(value: Manager) {
				captured = value;
			},
			captureInstances() {},
		};
		const mounted = mount(RegistryFixture, base);
		await settle();
		expect(captured).toBe(custom);
		expect(custom.sensors).toEqual([]);

		mounted.update(RegistryFixture, {
			...base,
			sensors: [KeyboardSensor],
			plugins: [Feedback],
		});
		await settle();
		expect(custom.sensors.some((sensor) => sensor instanceof KeyboardSensor)).toBe(true);
		expect(custom.plugins.some((plugin) => plugin instanceof Feedback)).toBe(true);
		mounted.unmount();
	});
});

describe('sortable', () => {
	it('registers both halves of repeated sortable hooks and keeps input changes live', async () => {
		let manager: Manager | null = null;
		let instances: any;
		const props = {
			firstId: 'sort-one',
			firstIndex: 0,
			group: 'group-a',
			captureManager(value: Manager) {
				manager = value;
			},
			captureInstances(value: unknown) {
				instances = value;
			},
		};
		const mounted = mount(SortableFixture, props);
		await settle();

		expect(manager!.registry.draggables.has('sort-one')).toBe(true);
		expect(manager!.registry.droppables.has('sort-one')).toBe(true);
		expect(manager!.registry.draggables.has('sort-two')).toBe(true);
		expect(manager!.registry.droppables.has('sort-two')).toBe(true);
		expect(instances.first.sortable).not.toBe(instances.second.sortable);
		expect(instances.first.sortable.index).toBe(0);
		expect(instances.first.sortable.group).toBe('group-a');
		expect(instances.first.isDragging).toBe(false);
		expect(instances.first.isDropping).toBe(false);
		expect(instances.first.isDragSource).toBe(false);
		expect(instances.first.isDropTarget).toBe(false);
		expect(isSortable(instances.first.sortable.draggable)).toBe(true);
		expect(isSortable(instances.first.sortable.droppable)).toBe(true);
		expect(
			isSortableOperation({
				source: instances.first.sortable.draggable,
				target: instances.first.sortable.droppable,
			}),
		).toBe(true);

		const sortableElement = mounted.find('#sort-one');
		setRect(sortableElement);
		await manager!.actions.start({ source: 'sort-one', coordinates: { x: 10, y: 10 } });
		await settle();
		expect(instances.first.isDragging).toBe(false);
		expect(instances.first.isDragSource).toBe(true);
		expect(sortableElement.getAttribute('data-source')).toBe('true');
		manager!.actions.stop({ canceled: true });
		await waitForIdle(manager!);
		expect(instances.first.isDragSource).toBe(false);
		expect(sortableElement.getAttribute('data-source')).toBe('false');

		const explicitElement = document.createElement('article');
		const explicitHandle = document.createElement('button');
		const explicitTarget = document.createElement('aside');
		mounted.update(SortableFixture, {
			...props,
			firstId: 'sort-renamed',
			firstIndex: 4,
			group: 'group-b',
			accept: ['sortable'],
			alignment: { x: 'end', y: 'start' },
			collisionDetector,
			collisionPriority: CollisionPriority.Highest,
			data: { label: 'updated' },
			disabled: { draggable: true, droppable: false },
			element: explicitElement,
			handle: explicitHandle,
			modifiers: [TestModifier],
			plugins: [Feedback],
			sensors: [KeyboardSensor],
			target: explicitTarget,
			transition: { duration: 0, easing: 'linear', idle: true },
			type: 'sortable',
		});
		await settle();
		expect(manager!.registry.draggables.has('sort-one')).toBe(false);
		expect(manager!.registry.droppables.has('sort-one')).toBe(false);
		expect(manager!.registry.draggables.has('sort-renamed')).toBe(true);
		expect(instances.first.sortable.index).toBe(4);
		expect(instances.first.sortable.group).toBe('group-b');
		expect(instances.first.sortable.element).toBe(explicitElement);
		expect(instances.first.sortable.draggable.handle).toBe(explicitHandle);
		expect(instances.first.sortable.target).toBe(explicitTarget);
		expect(instances.first.sortable.accept).toEqual(['sortable']);
		expect(instances.first.sortable.alignment).toEqual({ x: 'end', y: 'start' });
		expect(instances.first.sortable.droppable.collisionDetector).toBe(collisionDetector);
		expect(instances.first.sortable.droppable.collisionPriority).toBe(CollisionPriority.Highest);
		expect(instances.first.sortable.draggable.data).toEqual({ label: 'updated' });
		expect(instances.first.sortable.disabled).toEqual({ draggable: true, droppable: false });
		expect(instances.first.sortable.draggable.modifiers).toEqual([TestModifier]);
		expect(instances.first.sortable.draggable.plugins).toEqual([Feedback]);
		expect(instances.first.sortable.draggable.sensors).toEqual([KeyboardSensor]);
		expect(instances.first.sortable.transition).toEqual({
			duration: 0,
			easing: 'linear',
			idle: true,
		});
		expect(instances.first.sortable.type).toBe('sortable');
		const sourceElement = document.createElement('div');
		const targetElement = document.createElement('div');
		instances.first.sourceRef(sourceElement);
		instances.first.targetRef(targetElement);
		expect(instances.first.sortable.source).toBe(sourceElement);
		expect(instances.first.sortable.target).toBe(targetElement);
		instances.first.sourceRef(null);
		instances.first.targetRef(null);
		expect(instances.first.sortable.source).toBeUndefined();
		expect(instances.first.sortable.target).toBeUndefined();
		mounted.unmount();
	});
});

describe('keyboard interactions, monitors, overlay, and accessibility', () => {
	it('runs the complete keyboard lifecycle through provider and monitor handlers', async () => {
		let manager: Manager | null = null;
		const events: string[] = [];
		const mounted = mount(InteractionFixture, {
			sensors: [KeyboardSensor],
			plugins: [Feedback],
			overlayDisabled: false,
			events,
			captureManager(value: Manager) {
				manager = value;
			},
		});
		await settle();
		const source = mounted.find('#drag');
		const target = mounted.find('#drop');
		setRect(source, { left: 0, top: 0, width: 40, height: 40 });
		setRect(target, { left: 0, top: 0, width: 80, height: 80 });

		await keydown(source, 'Space', ' ');
		expect(manager!.dragOperation.status.dragging).toBe(true);
		expect(manager!.dragOperation.source?.id).toBe('drag');
		expect(mounted.find('#operation-source').textContent).toBe('drag');
		expect(mounted.find('#overlay-content').textContent).toBe('drag');
		expect(events).toEqual(expect.arrayContaining(['monitor:before', 'provider:before']));
		expect(events).toEqual(expect.arrayContaining(['monitor:start', 'provider:start']));

		await keydown(source, 'ArrowDown');
		expect(events).toEqual(expect.arrayContaining(['monitor:move', 'provider:move']));
		await manager!.actions.setDropTarget(null);
		await manager!.actions.setDropTarget('drop');
		await settle();
		expect(events).toEqual(expect.arrayContaining(['monitor:over', 'provider:over']));

		await keydown(source, 'Space', ' ');
		await waitForIdle(manager!);
		expect(mounted.container.querySelector('#overlay-content')).toBeNull();
		expect(events).toEqual(expect.arrayContaining(['monitor:end', 'provider:end']));
		mounted.unmount();
	});

	it('supports static overlay children and the disabled overlay branch', async () => {
		let staticManager: Manager | null = null;
		let overlayRegistry: Manager['registry']['draggables'] | undefined;
		const staticMount = mount(StaticOverlayFixture, {
			sensors: [KeyboardSensor],
			plugins: [Feedback],
			captureManager(value: Manager) {
				staticManager = value;
			},
			captureOverlayRegistry(value: Manager['registry']['draggables']) {
				overlayRegistry = value;
			},
		});
		await settle();
		const staticSource = staticMount.find('#static-drag');
		setRect(staticSource);
		expect(staticMount.container.querySelector('#static-overlay')).toBeNull();
		await keydown(staticSource, 'Space', ' ');
		expect(staticMount.find('#static-overlay').textContent).toBe('static overlay');
		expect(overlayRegistry).toBe(staticManager!.registry.draggables);
		expect(staticManager!.registry.draggables.has('overlay-drag')).toBe(false);
		await keydown(staticSource, 'Escape');
		staticMount.unmount();

		const disabledMount = mount(InteractionFixture, {
			sensors: [KeyboardSensor],
			plugins: [Feedback],
			overlayDisabled: () => true,
			events: [],
			captureManager() {},
		});
		await settle();
		const disabledSource = disabledMount.find('#drag');
		setRect(disabledSource);
		await keydown(disabledSource, 'Space', ' ');
		expect(disabledMount.container.querySelector('#overlay-content')).toBeNull();
		await keydown(disabledSource, 'Escape');
		disabledMount.unmount();
	});

	it('applies deterministic accessibility attributes and announcements', async () => {
		const mounted = mount(InteractionFixture, {
			sensors: [KeyboardSensor],
			plugins: [Accessibility.configure({ id: 'test', debounce: 0 })],
			overlayDisabled: false,
			events: [],
			captureManager() {},
		});
		await settle();
		const source = mounted.find('#drag');
		setRect(source);
		expect(source.getAttribute('aria-roledescription')).toBe('draggable');
		expect(source.getAttribute('aria-describedby')).toBe('dnd-kit-description-test');
		expect(source.getAttribute('aria-disabled')).toBe('false');
		expect(document.querySelector('#dnd-kit-description-test')?.textContent).toContain(
			'press the space bar',
		);

		await keydown(source, 'Space', ' ');
		expect(document.querySelector('#dnd-kit-announcement-test')?.textContent).toBe(
			'Picked up draggable item drag.',
		);
		await keydown(source, 'Escape');
		expect(document.querySelector('#dnd-kit-announcement-test')?.textContent).toContain(
			'Dragging was cancelled',
		);
		mounted.unmount();
		expect(document.querySelector('#dnd-kit-description-test')).toBeNull();
		expect(document.querySelector('#dnd-kit-announcement-test')).toBeNull();
	});
});

describe('pointer interactions', () => {
	it('starts immediately with configured constraints, moves, and cancels with Escape', async () => {
		let manager: Manager | null = null;
		const events: string[] = [];
		const mounted = mount(InteractionFixture, {
			sensors: [PointerSensor.configure({ activationConstraints: [] })],
			plugins: [Feedback],
			overlayDisabled: false,
			events,
			captureManager(value: Manager) {
				manager = value;
			},
		});
		await settle();
		const source = mounted.find('#drag');
		const target = mounted.find('#drop');
		setRect(source, { left: 0, top: 0, width: 40, height: 40 });
		setRect(target, { left: 0, top: 0, width: 100, height: 100 });

		flushSync(() => {
			source.dispatchEvent(
				new PointerEvent('pointerdown', {
					bubbles: true,
					cancelable: true,
					button: 0,
					clientX: 10,
					clientY: 10,
					isPrimary: true,
					pointerId: 7,
					pointerType: 'mouse',
				}),
			);
		});
		await settle();
		expect(manager!.dragOperation.status.dragging).toBe(true);

		document.dispatchEvent(
			new PointerEvent('pointermove', {
				bubbles: true,
				cancelable: true,
				clientX: 20,
				clientY: 20,
				isPrimary: true,
				pointerId: 7,
				pointerType: 'mouse',
			}),
		);
		await settle();
		expect(events).toEqual(expect.arrayContaining(['monitor:move', 'provider:move']));

		await keydown(document.body, 'Escape');
		await waitForIdle(manager!);
		expect(events).toEqual(expect.arrayContaining(['monitor:cancel', 'provider:cancel']));
		mounted.unmount();
	});
});

describe('developer diagnostics', () => {
	it('warns when a drag monitor is mounted outside a provider', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const mounted = mount(MonitorOutsideProvider);
		await settle();
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('outside of a DragDropProvider'));
		mounted.unmount();
	});
});
