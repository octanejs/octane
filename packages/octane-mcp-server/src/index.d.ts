import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export declare const BUNDLED_SKILLS: Record<string, string>;
export declare const REPO_SKILLS: Record<string, string>;
export declare const BENCHMARK_SUITES: string[];
export declare function instructionsFor(repoMode: boolean): string;
export declare function text(content: string): { content: { type: 'text'; text: string }[] };
export declare function isOctaneRepo(root: string): boolean;
export declare function areaForPath(path: string): string;
export declare function validationFor(paths: string[], taskKind: string): string[];
interface EngineeringInput {
	scope: 'application' | 'library' | 'framework-core';
	changeKind?: 'bug' | 'feature' | 'performance' | 'refactor' | 'api' | 'docs' | 'test' | 'unknown';
	paths?: string[];
	performanceSensitive?: boolean;
}
export declare function engineeringPlanFor(
	input: EngineeringInput,
	repoMode?: boolean,
): {
	scope: EngineeringInput['scope'];
	changeKind: NonNullable<EngineeringInput['changeKind']>;
	performanceSensitive: boolean;
	areas: { path: string; area: string }[];
	requiredSkills: string[];
	gates: {
		contract: string[];
		correctness: string[];
		performance: string[];
		selfReview: string[];
		handoff: string[];
		parity?: string[];
	};
	blockingConditions?: string[];
	validationCommands?: string[];
};
interface CommandResult {
	code: number | null;
	signal: string | null;
	stdout: string;
	stderr: string;
}
export declare function runCommand(
	command: string,
	args: string[],
	options?: { cwd?: string; timeoutMs?: number; env?: Record<string, string | undefined> },
): Promise<CommandResult>;
export declare function scaffoldReactPort(
	repoRoot: string,
	input: { reactTestFile: string; outFile?: string; timeoutMs?: number },
): Promise<CommandResult & { command: string[] }>;
export declare function runBenchmark(
	repoRoot: string,
	input: { benchmark?: string; quick?: boolean; timeoutMs?: number },
): Promise<CommandResult & { command: string[]; benchmark?: string }>;
export declare function issueContext(
	repoRoot: string,
	input: { issue: string | number; timeoutMs?: number },
): Promise<
	| (CommandResult & { command: string[]; parseError?: string })
	| {
			command: string[];
			issue: Record<string, unknown>;
			triage: { suggestedArea: string; labels: string[]; state: string; url: string };
	  }
>;
export declare function createServer(options?: { repoRoot?: string }): McpServer;
export declare function main(): Promise<void>;
