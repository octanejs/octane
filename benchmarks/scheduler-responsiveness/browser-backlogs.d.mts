import type { Browser } from 'playwright';
import type { Scenario } from '../../packages/octane/tests/browser/scheduler-backlogs/shared.js';

export function serveBacklogs(
	source?: string,
	policy?: 'elapsed' | 'count' | 'combined',
): Promise<{
	url: string;
	policy: string;
	bundleBytes: Record<string, { raw: number; gzip: number }>;
	close(): Promise<void>;
}>;
export function measureBacklog(
	browser: Browser,
	url: string,
	scenario: Scenario,
	target?: 'octane' | 'react',
	options?: {
		payloadBytes?: number;
		count?: number;
		producers?: number;
		roots?: 'many';
		chunks?: 'fragmented';
		mode?: 'ready' | 'cold' | 'blocked';
		actionWorkMs?: number;
		workMs?: number;
		cpuRate?: number;
		memory?: boolean;
		tracePath?: string;
	},
): Promise<{
	values: number;
	commits: number;
	effects: number;
	completionMs: number;
	inputsDuringWork: number;
	[metric: string]: unknown;
}>;
