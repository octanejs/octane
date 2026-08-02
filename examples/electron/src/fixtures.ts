import type { Task, TaskDetail } from './types';

export const TASKS: Task[] = [
	{ id: 'typecheck', name: 'Typecheck', summary: 'Project-wide TypeScript pass' },
	{ id: 'bundle', name: 'Bundle', summary: 'Production client build' },
	{ id: 'migrate', name: 'Migrate', summary: 'Apply pending schema migrations' },
];

const DETAILS: Record<string, TaskDetail> = {
	typecheck: {
		id: 'typecheck',
		command: 'tsrx-tsc --noEmit',
		workingDirectory: '~/projects/electron-shell',
		lastRun: '2026-08-02 09:14',
		averageMs: 8400,
	},
	bundle: {
		id: 'bundle',
		command: 'vite build --mode production',
		workingDirectory: '~/projects/electron-shell',
		lastRun: '2026-08-02 09:02',
		averageMs: 15200,
	},
	migrate: {
		id: 'migrate',
		command: 'electron-shell migrate --yes',
		workingDirectory: '~/projects/electron-shell/db',
		lastRun: '2026-08-01 18:41',
		averageMs: 2600,
	},
};

const LOGS: Record<string, string[]> = {
	typecheck: [
		'resolving project references',
		'loading tsconfig.json',
		'checking 412 files',
		'checking 812 files',
		'checking 1204 files',
		'checking 1611 files',
		'no diagnostics reported',
		'typecheck finished',
	],
	bundle: [
		'clearing dist/',
		'compiling 96 modules',
		'compiling 214 modules',
		'compiling 388 modules',
		'inlining assets',
		'minifying chunks',
		'writing dist/client',
		'bundle finished',
	],
	migrate: [
		'connecting to local database',
		'reading migration ledger',
		'applying 2026_07_14_projects',
		'applying 2026_07_21_runs',
		'applying 2026_07_24_logs',
		'verifying constraints',
		'writing schema snapshot',
		'migrate finished',
	],
};

export function describeTask(id: string): TaskDetail | null {
	return DETAILS[id] ?? null;
}

export function logScript(id: string): string[] {
	return LOGS[id] ?? [];
}
