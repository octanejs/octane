import type { Issue, Person } from './types.ts';

const maya: Person = {
	id: 'maya',
	name: 'Maya Chen',
	initials: 'MC',
	role: 'Product design',
};

const theo: Person = {
	id: 'theo',
	name: 'Theo Martin',
	initials: 'TM',
	role: 'Frontend',
};

const iman: Person = {
	id: 'iman',
	name: 'Iman Okafor',
	initials: 'IO',
	role: 'Infrastructure',
};

const sofia: Person = {
	id: 'sofia',
	name: 'Sofia Alvarez',
	initials: 'SA',
	role: 'Quality',
};

const SEEDED_ISSUES: readonly Issue[] = [
	{
		id: 'FLT-101',
		title: 'Design the command palette',
		description:
			'Create a fast keyboard-first command palette for navigating projects, issues, and saved views.',
		status: 'backlog',
		priority: 'high',
		assignee: maya,
		labels: ['Design', 'Navigation'],
		estimate: 5,
	},
	{
		id: 'FLT-102',
		title: 'Unify notification preferences',
		description:
			'Consolidate email, desktop, and mobile notification controls into one understandable settings flow.',
		status: 'backlog',
		priority: 'medium',
		assignee: theo,
		labels: ['Settings'],
		estimate: 3,
	},
	{
		id: 'FLT-201',
		title: 'Ship project health signals',
		description:
			'Surface delivery risk from cycle time, blocked issues, and milestone drift without obscuring the board.',
		status: 'in-progress',
		priority: 'urgent',
		assignee: iman,
		labels: ['Analytics', 'Beta'],
		estimate: 8,
	},
	{
		id: 'FLT-202',
		title: 'Add compact board density',
		description:
			'Offer a compact view that keeps priority, assignee, and status readable on smaller screens.',
		status: 'in-progress',
		priority: 'low',
		assignee: maya,
		labels: ['Accessibility', 'UI'],
		estimate: 3,
	},
	{
		id: 'FLT-301',
		title: 'Verify offline issue edits',
		description:
			'Exercise local edits while disconnected and clearly communicate when queued changes are synced.',
		status: 'review',
		priority: 'high',
		assignee: sofia,
		labels: ['Offline', 'Quality'],
		estimate: 5,
	},
	{
		id: 'FLT-401',
		title: 'Publish keyboard shortcuts',
		description:
			'Document board navigation and movement shortcuts with discoverable labels and screen-reader guidance.',
		status: 'done',
		priority: 'medium',
		assignee: theo,
		labels: ['Docs', 'Accessibility'],
		estimate: 2,
	},
];

/** Return fresh records so every browser journey begins from exactly the same board. */
export function createSeededIssues(): Issue[] {
	return SEEDED_ISSUES.map((issue) => ({
		...issue,
		assignee: { ...issue.assignee },
		labels: [...issue.labels],
	}));
}
