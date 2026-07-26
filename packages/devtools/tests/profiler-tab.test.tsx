/** @jsxImportSource octane */
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@octanejs/testing-library';
import { ProfilerTab } from '../src/panel/ProfilerTab';
import { OctaneDevtoolsEventClient } from '../src/client';

// globals: false in the octane-devtools vitest project — @octanejs/testing-library's
// auto-cleanup side effect only registers when a global afterEach exists, so this
// file registers it itself (same pattern as components-tab.test.tsx).
afterEach(() => cleanup());

describe('ProfilerTab', () => {
	it('renders the ranked summary and recent commits from a profile event', async () => {
		const client = new OctaneDevtoolsEventClient();
		render(<ProfilerTab client={client} />);

		// The tab subscribes to 'profile' inside a useEffect, already live by the time
		// render() returns (see components-tab.test.tsx for why this ordering matters).
		client.emit('profile', {
			summaries: [
				{
					componentId: 'c1',
					component: 'SlowList',
					file: 'x.tsrx',
					attempts: 5,
					completed: 5,
					suspended: 0,
					errored: 0,
					bails: 0,
					totalSelfTime: 12.5,
					maxInclusiveTime: 20,
					averageSelfTime: 2.5,
					averageQueueDelay: 1,
					dominantCause: 'state',
				},
			],
			recentEvents: [
				{
					component: 'SlowList',
					phase: 'update',
					outcome: 'completed',
					selfDuration: 2.5,
					duration: 4,
					queueDelay: 1,
					causes: ['state'],
				},
			],
		});

		expect(await screen.findByText('SlowList')).toBeInTheDocument();
		expect(screen.getByText(/12\.5/)).toBeInTheDocument(); // totalSelfTime
		expect(screen.getByText(/update/)).toBeInTheDocument(); // commit phase
	});

	it('shows an empty state before any profile event', () => {
		const client = new OctaneDevtoolsEventClient();
		render(<ProfilerTab client={client} />);
		expect(screen.getByText(/no profiling data/i)).toBeInTheDocument();
	});
});
