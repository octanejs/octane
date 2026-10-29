import type { createColors } from 'picocolors';

interface Project {
	root: string;
	manifestPath: string | null;
	manifest: Record<string, any>;
	declaredDependencies: Record<string, string>;
	bindings: string[];
	packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | null;
	lockfile: string | null;
	tsconfig: { path: string; config: Record<string, any>; chain: string[] } | null;
	bundlerConfigPath: string | null;
	bundler: 'vite' | 'rspack' | 'rsbuild' | 'rspeedy' | null;
	octaneConfigPath: string | null;
	sourceFiles: string[];
	tsrxFiles: string[];
	isOctaneProject: boolean;
}

interface Exec {
	which(bin: string): string | null;
	run(
		file: string,
		args: string[],
		options?: { cwd?: string },
	): Promise<{ code: number; stdout: string; stderr: string }>;
}
interface Output {
	write(text: string): unknown;
	isTTY?: boolean;
}
interface RunOptions {
	env?: Record<string, string | undefined>;
	stdout?: Output;
	stderr?: Output;
	tty?: boolean;
	exec?: Exec;
}
interface Prompt {
	message: string;
	flag: string;
}
interface Choice {
	value: string;
	label: string;
	hint?: string;
}
interface CommandContext {
	cwd: string;
	env: Record<string, string | undefined>;
	version: string;
	ui: {
		mode: 'interactive' | 'plain' | 'json';
		colors: ReturnType<typeof createColors>;
		readonly canPrompt: boolean;
		intro(title: string): void;
		outro(message: string): void;
		log(line?: string): void;
		note(title: string, lines: string[]): void;
		spinner(label: string): { update(message: string): void; stop(message: string): void };
		select(prompt: Prompt & { options: Choice[]; initial?: string }): Promise<string>;
		multiselect(prompt: Prompt & { options: Choice[]; initial?: string[] }): Promise<string[]>;
		text(prompt: Prompt & { placeholder?: string; initial?: string }): Promise<string>;
		confirm(prompt: Prompt & { initial?: boolean }): Promise<boolean>;
	};
	exec: Exec;
	json: boolean;
	yes: boolean;
	dryRun: boolean;
	verbose: boolean;
	project(): Project;
	refreshProject(): Project;
}
interface Command {
	description?: string;
	flags?: Record<
		string,
		{
			type: 'boolean' | 'string' | 'number';
			description: string;
			short?: string;
			default?: unknown;
			choices?: readonly string[];
			repeatable?: boolean;
			placeholder?: string;
		}
	>;
	positionals?: { name: string; description: string; required?: boolean; variadic?: boolean }[];
	subcommands?: {
		name: string;
		summary: string;
		aliases?: string[];
		load(): Promise<{ default: Command }>;
	}[];
	requiresProject?: boolean;
	passthrough?: boolean;
	run?(
		ctx: CommandContext,
		input: { flags: Record<string, any>; positionals: string[]; rest: string[] },
	): Promise<void | number | { exitCode?: number; json?: unknown }>;
}
export declare const VERSION: string;
export declare function main(argv: string[], options?: RunOptions): Promise<number>;
export declare function defineCommand(command: Command): Command;
export declare class CliError extends Error {
	constructor(message: string, options?: { exitCode?: number; hint?: string });
	exitCode: number;
	hint: string | undefined;
}
export declare const EXIT: { OK: 0; FAILURE: 1; USAGE: 2; DIAGNOSTIC: 3 };
export declare function detectProject(cwd: string): Project;
export declare function findRoot(cwd: string): string;
export declare function scanSourceFiles(root: string, options?: { limit?: number }): string[];
