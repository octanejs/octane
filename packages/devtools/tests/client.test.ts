import { describe, expect, it, vi } from 'vitest';
import { OctaneDevtoolsEventClient, PLUGIN_ID } from '../src/client';

describe('OctaneDevtoolsEventClient', () => {
	it('emits and receives a tree snapshot over a shared window bus', async () => {
		// Two clients on the same window bus == app side + panel side.
		const app = new OctaneDevtoolsEventClient();
		const panel = new OctaneDevtoolsEventClient();
		const received = vi.fn();
		panel.on('tree', (e) => received(e.payload));

		// A ClientEventBus (tests/setup.ts) answers the client's connect handshake
		// and re-broadcasts the event, so the first emit both connects and delivers.
		app.emit('tree', { nodes: [{ id: 1, name: 'App', kind: 'root', children: [] }] });
		await Promise.resolve();
		expect(received).toHaveBeenCalledWith({
			nodes: [{ id: 1, name: 'App', kind: 'root', children: [] }],
		});
	});

	it('uses the octane plugin id', () => {
		expect(PLUGIN_ID).toBe('octane');
	});

	it('round-trips a profile snapshot', async () => {
		const app = new OctaneDevtoolsEventClient();
		const panel = new OctaneDevtoolsEventClient();
		const received = vi.fn();
		panel.on('profile', (e) => received(e.payload));
		app.emit('profile', { summaries: [], recentEvents: [] });
		await Promise.resolve();
		expect(received).toHaveBeenCalledWith({ summaries: [], recentEvents: [] });
	});

	it('round-trips a transition snapshot', async () => {
		const app = new OctaneDevtoolsEventClient();
		const panel = new OctaneDevtoolsEventClient();
		const received = vi.fn();
		panel.on('transition', (e) => received(e.payload));
		app.emit('transition', { pendingCount: 1, boundaries: [] });
		await Promise.resolve();
		expect(received).toHaveBeenCalledWith({ pendingCount: 1, boundaries: [] });
	});
});
