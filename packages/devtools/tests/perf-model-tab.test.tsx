/** @jsxImportSource octane */
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@octanejs/testing-library';
import { PerfModelTab } from '../src/panel/PerfModelTab.tsrx';
import { OctaneDevtoolsEventClient } from '../src/client';

// globals: false in the octane-devtools vitest project — @octanejs/testing-library's
// auto-cleanup side effect only registers when a global afterEach exists, so this
// file registers it itself (same pattern as profiler-tab.test.tsx).
afterEach(() => cleanup());

describe('PerfModelTab', () => {
	it('derives slowest mounts and queue-delay hotspots from a profile event', async () => {
		const client = new OctaneDevtoolsEventClient();
		render(<PerfModelTab client={client} />);
		client.emit('profile', {
			summaries: [
				{
					componentId: 'a',
					component: 'Fast',
					file: 'a',
					attempts: 1,
					completed: 1,
					suspended: 0,
					errored: 0,
					bails: 0,
					totalSelfTime: 1,
					maxInclusiveTime: 2,
					averageSelfTime: 1,
					averageQueueDelay: 8,
					dominantCause: 'state',
				},
				{
					componentId: 'b',
					component: 'Heavy',
					file: 'b',
					attempts: 1,
					completed: 1,
					suspended: 0,
					errored: 0,
					bails: 0,
					totalSelfTime: 20,
					maxInclusiveTime: 25,
					averageSelfTime: 20,
					averageQueueDelay: 1,
					dominantCause: 'mount',
				},
			],
			recentEvents: [
				{
					component: 'Heavy',
					phase: 'mount',
					outcome: 'completed',
					selfDuration: 20,
					duration: 25,
					queueDelay: 1,
					causes: ['mount'],
				},
				{
					component: 'Fast',
					phase: 'update',
					outcome: 'completed',
					selfDuration: 1,
					duration: 2,
					queueDelay: 8,
					causes: ['state'],
				},
			],
		});
		// Slowest mount by self time = Heavy (20ms).
		expect(await screen.findByText(/Heavy/)).toBeInTheDocument();
		expect(screen.getByText(/20/)).toBeInTheDocument();
		// Queue-delay hotspot = Fast (8ms).
		expect(screen.getByText(/Fast/)).toBeInTheDocument();
	});

	it('shows an empty state before any profile event', () => {
		const client = new OctaneDevtoolsEventClient();
		render(<PerfModelTab client={client} />);
		expect(screen.getByText(/no performance data yet/i)).toBeInTheDocument();
	});
});
