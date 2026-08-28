import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushEffects, mount } from '../../../octane/tests/_helpers';
import {
	ConnectionSlotProbe,
	MiddlewareSlotProbe,
	NodesEdgesStateSlotProbe,
	ReactFlowSlotProbe,
	ViewportChangeSlotProbe,
} from '../_fixtures/connection-slots.tsrx';

describe('@octanejs/xyflow — manual hook slots', () => {
	let root: ReturnType<typeof mount> | undefined;

	afterEach(function cleanup() {
		root?.unmount();
		root = undefined;
		vi.restoreAllMocks();
	});

	it('keeps repeated connection hook calls independent', () => {
		vi.spyOn(console, 'warn').mockImplementation(function ignoreDeprecationWarning() {});

		root = mount(ConnectionSlotProbe);
		flushEffects();

		expect(root.container.querySelector('[data-testid="connected-node"]')?.textContent).toBe('1');
		expect(root.container.querySelector('[data-testid="isolated-node"]')?.textContent).toBe('0');
		expect(root.container.querySelector('[data-testid="connected-handle"]')?.textContent).toBe('1');
		expect(root.container.querySelector('[data-testid="isolated-handle"]')?.textContent).toBe('0');
	});

	it('registers every viewport change phase', () => {
		root = mount(ViewportChangeSlotProbe);
		flushEffects();

		root.click('[data-testid="fire-viewport-phases"]');

		expect(root.container.querySelector('[data-testid="viewport-phases"]')?.textContent).toBe(
			'start,change,end',
		);
	});

	it('combines general and viewport helpers in useReactFlow', () => {
		root = mount(ReactFlowSlotProbe);
		flushEffects();

		root.click('[data-testid="read-react-flow"]');

		expect(root.container.querySelector('[data-testid="react-flow-snapshot"]')?.textContent).toBe(
			'3:1:0:0:1',
		);
		expect(root.container.querySelector('[data-testid="react-flow-identity"]')?.textContent).toBe(
			'stable',
		);
	});

	it('keeps node and edge state callbacks independent', () => {
		root = mount(NodesEdgesStateSlotProbe);

		root.click('[data-testid="remove-node"]');
		expect(root.container.querySelector('[data-testid="state-node-ids"]')?.textContent).toBe(
			'node-b',
		);
		expect(root.container.querySelector('[data-testid="state-edge-ids"]')?.textContent).toBe(
			'edge-a-b',
		);

		root.click('[data-testid="remove-edge"]');
		expect(root.container.querySelector('[data-testid="state-node-ids"]')?.textContent).toBe(
			'node-b',
		);
		expect(root.container.querySelector('[data-testid="state-edge-ids"]')?.textContent).toBe('');
	});

	it('registers node and edge change middleware independently', () => {
		root = mount(MiddlewareSlotProbe);
		flushEffects();

		root.click('[data-testid="run-middlewares"]');

		expect(root.container.querySelector('[data-testid="middleware-snapshot"]')?.textContent).toBe(
			'0:0',
		);
	});
});
