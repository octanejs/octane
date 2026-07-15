export const ISSUE_STATUSES = ['backlog', 'in-progress', 'review', 'done'] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export type IssuePriority = 'urgent' | 'high' | 'medium' | 'low';

export interface Person {
	id: string;
	name: string;
	initials: string;
	role: string;
}

export interface Issue {
	id: string;
	title: string;
	description: string;
	status: IssueStatus;
	priority: IssuePriority;
	assignee: Person;
	labels: readonly string[];
	estimate: number;
}

export interface IssueDragData {
	kind: 'issue';
	issueId: string;
	status: IssueStatus;
	index: number;
}

export interface ColumnDragData {
	kind: 'column';
	status: IssueStatus;
}

export type FlowboardDragData = IssueDragData | ColumnDragData;

export interface BoardRoute {
	issueId: string | null;
}

export function isIssueStatus(value: string): value is IssueStatus {
	return ISSUE_STATUSES.includes(value as IssueStatus);
}

export function statusLabel(status: IssueStatus): string {
	switch (status) {
		case 'backlog':
			return 'Backlog';
		case 'in-progress':
			return 'In progress';
		case 'review':
			return 'Review';
		case 'done':
			return 'Done';
	}
}
