import { use } from 'octane';

export interface Team {
	id: string;
	name: string;
}

export interface TeamStats {
	open: number;
	closed: number;
}

export function App(props: {
	teamId: string;
	loadTeam: (teamId: string) => Promise<Team>;
	loadStats: (teamId: string) => Promise<TeamStats>;
}) @{
	<section>
		@try {
			const team = use(props.loadTeam(props.teamId));
			const stats = use(props.loadStats(team.id));
			<article aria-label="Team dashboard">
				<h2>
					{team.name as string}
				</h2>
				<output aria-label="Open issues">
					{stats.open as string}
				</output>
				<output aria-label="Closed issues">
					{stats.closed as string}
				</output>
			</article>
		} @pending {
			<p role="status">Loading dashboard…</p>
		} @catch (error) {
			const message =
				error instanceof Error ? error.message : String(error);
			<p role="alert">{'Could not load dashboard: ' + message}</p>
		}
	</section>
}
