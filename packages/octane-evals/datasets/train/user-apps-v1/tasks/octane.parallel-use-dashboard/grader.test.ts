import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@octanejs/testing-library';
import {
	App,
	type Team,
	type TeamStats,
} from '@octane-eval-submission/octane.parallel-use-dashboard/src/App.tsrx';

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});
	return { promise, resolve, reject };
}

afterEach(cleanup);

describe('parallel use dashboard', () => {
	it('starts both independent requests together and creates each promise once', async () => {
		const team = deferred<Team>();
		const stats = deferred<TeamStats>();
		const loadTeam = vi.fn(() => team.promise);
		const loadStats = vi.fn(() => stats.promise);

		const view = render(App, {
			props: { teamId: 'team-1', loadTeam, loadStats },
		});

		expect(loadTeam.mock.calls).toEqual([['team-1']]);
		expect(loadStats.mock.calls).toEqual([['team-1']]);
		expect(screen.getByRole('status').textContent).toBe('Loading dashboard…');
		expect(screen.queryByRole('article', { name: 'Team dashboard' })).toBeNull();

		await act(() => team.resolve({ id: 'team-1', name: 'Compiler team' }));
		expect(screen.getByRole('status').textContent).toBe('Loading dashboard…');
		expect(screen.queryByRole('article', { name: 'Team dashboard' })).toBeNull();
		expect(loadTeam).toHaveBeenCalledTimes(1);
		expect(loadStats).toHaveBeenCalledTimes(1);

		await act(() => stats.resolve({ open: 4, closed: 12 }));
		expect(screen.queryByText('Loading dashboard…')).toBeNull();
		expect(screen.getByRole('article', { name: 'Team dashboard' })).toBeTruthy();
		expect(screen.getByRole('heading').textContent).toBe('Compiler team');
		expect(screen.getByLabelText('Open issues').textContent).toBe('4');
		expect(screen.getByLabelText('Closed issues').textContent).toBe('12');
		expect(loadTeam).toHaveBeenCalledTimes(1);
		expect(loadStats).toHaveBeenCalledTimes(1);

		view.rerender({ props: { teamId: 'team-1', loadTeam, loadStats } });
		expect(screen.getByRole('heading').textContent).toBe('Compiler team');
		expect(loadTeam).toHaveBeenCalledTimes(1);
		expect(loadStats).toHaveBeenCalledTimes(1);
	});

	it('starts fresh requests when the team id or loader identity changes', async () => {
		const firstTeam = deferred<Team>();
		const firstStats = deferred<TeamStats>();
		const secondTeam = deferred<Team>();
		const secondStats = deferred<TeamStats>();
		const loadTeam = vi.fn((teamId: string) =>
			teamId === 'team-1' ? firstTeam.promise : secondTeam.promise,
		);
		const loadStats = vi.fn((teamId: string) =>
			teamId === 'team-1' ? firstStats.promise : secondStats.promise,
		);
		const view = render(App, {
			props: { teamId: 'team-1', loadTeam, loadStats },
		});

		await act(() => firstTeam.resolve({ id: 'team-1', name: 'Compiler team' }));
		await act(() => firstStats.resolve({ open: 4, closed: 12 }));
		expect(screen.getByRole('heading').textContent).toBe('Compiler team');

		view.rerender({ props: { teamId: 'team-2', loadTeam, loadStats } });
		expect(loadTeam.mock.calls).toEqual([['team-1'], ['team-2']]);
		expect(loadStats.mock.calls).toEqual([['team-1'], ['team-2']]);
		expect(screen.getByRole('status').textContent).toBe('Loading dashboard…');

		await act(() => secondTeam.resolve({ id: 'team-2', name: 'Runtime team' }));
		await act(() => secondStats.resolve({ open: 2, closed: 20 }));
		expect(screen.getByRole('heading').textContent).toBe('Runtime team');

		const replacementTeam = deferred<Team>();
		const replacementStats = deferred<TeamStats>();
		const replacementLoadTeam = vi.fn(() => replacementTeam.promise);
		const replacementLoadStats = vi.fn(() => replacementStats.promise);
		view.rerender({
			props: {
				teamId: 'team-2',
				loadTeam: replacementLoadTeam,
				loadStats: replacementLoadStats,
			},
		});

		expect(replacementLoadTeam.mock.calls).toEqual([['team-2']]);
		expect(replacementLoadStats.mock.calls).toEqual([['team-2']]);
		expect(screen.getByRole('status').textContent).toBe('Loading dashboard…');

		await act(() => replacementTeam.resolve({ id: 'team-2', name: 'New runtime team' }));
		await act(() => replacementStats.resolve({ open: 1, closed: 21 }));
		expect(screen.getByRole('heading').textContent).toBe('New runtime team');
		expect(screen.getByLabelText('Open issues').textContent).toBe('1');
	});

	it('routes a rejected independent request to the catch arm', async () => {
		const team = deferred<Team>();
		const stats = deferred<TeamStats>();
		const loadTeam = vi.fn(() => team.promise);
		const loadStats = vi.fn(() => stats.promise);
		render(App, { props: { teamId: 'broken', loadTeam, loadStats } });

		expect(loadTeam).toHaveBeenCalledOnce();
		expect(loadStats).toHaveBeenCalledOnce();
		await act(() => team.resolve({ id: 'broken', name: 'Broken team' }));
		expect(screen.getByRole('status').textContent).toBe('Loading dashboard…');
		await act(() => stats.reject(new Error('stats offline')));

		expect(screen.getByRole('alert').textContent).toBe('Could not load dashboard: stats offline');
		expect(screen.queryByText('Loading dashboard…')).toBeNull();
	});
});
