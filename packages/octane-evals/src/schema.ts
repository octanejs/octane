export const EVAL_SCHEMA_VERSION = '1.1' as const;
export const EVAL_SCHEMA_VERSIONS = ['1.0', EVAL_SCHEMA_VERSION] as const;

export const EVAL_SUITES = ['tsrx', 'octane', 'integration'] as const;
export const DATASET_SPLITS = ['train', 'dev', 'test'] as const;
export const CAPABILITIES = [
	'authoring',
	'migration',
	'repair',
	'semantic-parity',
	'api-integration',
	'ssr-hydration',
	'divergence-recognition',
] as const;
export const PORT_SHAPES = [
	'core-adapter',
	'stateful-binding',
	'dom-component',
	'compiler-build',
	'router-hybrid',
] as const;
export const DIFFICULTIES = ['introductory', 'standard', 'advanced'] as const;
export const LEGACY_CONTEXT_MODES = ['repo-docs', 'repo-docs-mcp', 'closed-book'] as const;
export const CURRENT_CONTEXT_MODES = [
	'framework-docs',
	'framework-docs-mcp',
	'closed-book',
] as const;
export const CONTEXT_MODES = [
	'repo-docs',
	'repo-docs-mcp',
	'framework-docs',
	'framework-docs-mcp',
	'closed-book',
] as const;
export const EXECUTION_MODES = ['completion', 'instruction', 'agentic'] as const;
export const OUTPUT_TYPES = ['patch', 'completion', 'classification'] as const;
export const RESULT_OUTCOMES = ['resolved', 'unresolved', 'error'] as const;
export const COMMAND_PHASES = ['public', 'target', 'regression'] as const;
export const COMMAND_OUTCOMES = ['passed', 'failed', 'error', 'skipped'] as const;
export const STOP_REASONS = [
	'completed',
	'max-turns',
	'max-tokens',
	'max-tool-calls',
	'timeout',
	'sandbox-limit',
	'model-error',
	'tool-error',
	'cancelled',
] as const;
export const PROMPT_ARTIFACT_ROLES = [
	'system',
	'developer',
	'user-template',
	'tool-instructions',
] as const;
export const FAILURE_STAGES = [
	'prediction',
	'patch-apply',
	'compile',
	'target-tests',
	'regression-tests',
	'timeout',
	'sandbox',
	'grader',
] as const;

export type EvalSuite = (typeof EVAL_SUITES)[number];
export type EvalSchemaVersion = (typeof EVAL_SCHEMA_VERSIONS)[number];
export type DatasetSplit = (typeof DATASET_SPLITS)[number];
export type Capability = (typeof CAPABILITIES)[number];
export type PortShape = (typeof PORT_SHAPES)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];
export type ContextMode = (typeof CONTEXT_MODES)[number];
export type ExecutionMode = (typeof EXECUTION_MODES)[number];
export type OutputType = (typeof OUTPUT_TYPES)[number];
export type ResultOutcome = (typeof RESULT_OUTCOMES)[number];
export type CommandPhase = (typeof COMMAND_PHASES)[number];
export type CommandOutcome = (typeof COMMAND_OUTCOMES)[number];
export type StopReason = (typeof STOP_REASONS)[number];
export type PromptArtifactRole = (typeof PROMPT_ARTIFACT_ROLES)[number];
export type FailureStage = (typeof FAILURE_STAGES)[number];

export interface SourceProvenance {
	repository: string;
	commit: string;
	license: string;
	path?: string;
	url?: string;
	attribution?: string;
}

export interface TaskProvenance {
	createdAt: string;
	publishedAt?: string;
	authors: string[];
	reviewers: string[];
	sources: SourceProvenance[];
}

export interface TaskPrompt {
	statement: string;
	outputType: OutputType;
	allowedPaths: string[];
}

export interface TaskEnvironment {
	repository: string;
	baseCommit: string;
	image: string;
	platform: string;
	node: string;
	pnpm: string;
	packageVersions: Record<string, string>;
	/** Lockfile from the pinned framework base commit. */
	lockfileHash: string;
	/** Effective evaluation overlay lockfile. Available from schema 1.1. */
	overlayLockfileHash?: string;
}

/** A schema 1.1 self-contained starter project supplied to an application-authoring task. */
export interface TaskWorkspace {
	kind: 'template';
	templatePath: string;
	templateDigest: string;
}

/** Schema 1.1 public answer bytes released only with a training task. */
export interface TrainingArtifacts {
	referencePath: string;
	referenceDigest: string;
}

export interface McpContext {
	package: string;
	version: string;
	tools: string[];
}

export interface TaskContext {
	mode: ContextMode;
	docsCommit?: string;
	mcp?: McpContext;
}

export interface ExecutionLimits {
	timeoutSeconds: number;
	cpu: number;
	memoryMb: number;
	maxProcesses: number;
	maxDiskMb: number;
	maxOutputBytes: number;
	maxTurns: number;
	/** Cumulative provider-reported input plus output tokens across all model calls. */
	maxTotalTokens: number;
	maxToolCalls: number;
}

export interface TaskPolicy extends ExecutionLimits {
	network: 'none';
	writablePaths: string[];
}

export interface PublicGraderMetadata {
	graderVersion: string;
	graderDigest: string;
	scoringPolicyDigest: string;
	publicCommands: PublicCommand[];
	hiddenBundleDigest?: string;
}

export interface PublicCommand {
	id: string;
	command: string;
}

/**
 * Public task metadata. Training tasks may expose reference metadata; hidden
 * grader contents and non-training gold artifacts remain absent.
 */
export interface TaskManifest {
	/** Parsers accept legacy 1.0 rows; EVAL_SCHEMA_VERSION identifies the current writer version. */
	schemaVersion: EvalSchemaVersion;
	benchmarkVersion: string;
	taskId: string;
	familyId: string;
	title: string;
	prompt: TaskPrompt;
	suite: EvalSuite;
	split: DatasetSplit;
	executionMode: ExecutionMode;
	capability: Capability;
	packageName?: string;
	portShape?: PortShape;
	difficulty?: Difficulty;
	provenance: TaskProvenance;
	environment: TaskEnvironment;
	workspace?: TaskWorkspace;
	trainingArtifacts?: TrainingArtifacts;
	context: TaskContext;
	policy: TaskPolicy;
	grader: PublicGraderMetadata;
	tags?: string[];
}

export type PublicTaskManifest = Omit<TaskManifest, 'split'> & {
	split: Exclude<DatasetSplit, 'test'>;
};

export interface ModelIdentity {
	provider: string;
	name: string;
	revision: string;
	weightsDigest?: string;
	configurationDigest: string;
}

export interface HarnessIdentity {
	repository: string;
	commit: string;
	image: string;
}

export interface PromptArtifact {
	role: PromptArtifactRole;
	digest: string;
	path?: string;
}

export interface RunTool {
	name: string;
	version: string;
	definitionDigest: string;
	configurationDigest: string;
}

export interface SamplingConfiguration {
	temperature?: number;
	topP?: number;
	seed?: number;
	reasoningEffort?: string;
	providerOptionsDigest: string;
}

/**
 * The first protocol version intentionally defines pass@1 only. Supporting
 * pass@k requires a separately versioned independence and aggregation contract.
 */
export interface RunAttemptPolicy {
	attemptsPerTask: 1;
	aggregation: 'pass@1';
}

export interface EvaluationRunManifest {
	schemaVersion: EvalSchemaVersion;
	runId: string;
	createdAt: string;
	benchmarkVersion: string;
	taskManifestDigest: string;
	scoringPolicyDigest: string;
	executionMode: ExecutionMode;
	context: TaskContext;
	model: ModelIdentity;
	harness: HarnessIdentity;
	promptArtifacts: PromptArtifact[];
	tools: RunTool[];
	sampling: SamplingConfiguration;
	limits: ExecutionLimits;
	attempts: RunAttemptPolicy;
}

export interface Prediction {
	schemaVersion: EvalSchemaVersion;
	runId: string;
	runManifestDigest: string;
	taskId: string;
	outputType: OutputType;
	output: string;
	attempt: 1;
	createdAt?: string;
}

export interface ResultMetrics {
	targetPassed?: number;
	targetTotal?: number;
	regressionPassed?: number;
	regressionTotal?: number;
	inputTokens: number;
	outputTokens: number;
	cachedInputTokens?: number;
	reasoningTokens?: number;
	turns: number;
	toolCalls: number;
	costUsd?: number;
}

export interface CommandResult {
	id: string;
	phase: CommandPhase;
	outcome: CommandOutcome;
	durationMs: number;
	exitCode?: number;
}

export interface EvaluationResult {
	schemaVersion: EvalSchemaVersion;
	runId: string;
	runManifestDigest: string;
	benchmarkVersion: string;
	taskManifestDigest: string;
	taskId: string;
	attempt: 1;
	outcome: ResultOutcome;
	failureStage?: FailureStage;
	stopReason: StopReason;
	durationMs: number;
	graderVersion: string;
	graderDigest: string;
	scoringPolicyDigest: string;
	environmentDigest: string;
	predictionDigest: string;
	metrics: ResultMetrics;
	commands: CommandResult[];
}

export interface SchemaIssue {
	path: string;
	message: string;
}

export class SchemaValidationError extends TypeError {
	readonly issues: readonly SchemaIssue[];

	constructor(label: string, issues: readonly SchemaIssue[]) {
		super(
			`${label} is invalid:\n${issues.map((issue) => `  - ${issue.path}: ${issue.message}`).join('\n')}`,
		);
		this.name = 'SchemaValidationError';
		this.issues = issues;
	}
}

type UnknownRecord = Record<string, unknown>;

const IDENTIFIER = /^[a-z0-9][a-z0-9._/-]*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const IMAGE_BY_DIGEST = /@sha256:[a-f0-9]{64}$/;
const GIT_COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const EXACT_SEMVER =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const PLATFORM = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
const SPDX_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9.+:-]*$/;
const FORBIDDEN_PUBLIC_KEYS = new Set([
	'answer',
	'gold',
	'goldpatch',
	'hiddentests',
	'oraclepatch',
	'privatetests',
	'referencepatch',
	'solution',
	'solutions',
	'testpatch',
]);

class Validator {
	readonly issues: SchemaIssue[] = [];

	issue(path: string, message: string): void {
		this.issues.push({ path, message });
	}

	record(value: unknown, path: string): UnknownRecord | undefined {
		if (value === null || typeof value !== 'object' || Array.isArray(value)) {
			this.issue(path, 'expected an object');
			return undefined;
		}
		return value as UnknownRecord;
	}

	keys(record: UnknownRecord, path: string, allowed: readonly string[]): void {
		const allowedSet = new Set(allowed);
		for (const key of Object.keys(record)) {
			if (!allowedSet.has(key)) this.issue(`${path}.${key}`, 'unknown field');
		}
	}

	string(record: UnknownRecord, key: string, path: string, optional = false): string | undefined {
		const value = record[key];
		if (value === undefined && optional) return undefined;
		if (typeof value !== 'string' || value.length === 0) {
			this.issue(`${path}.${key}`, 'expected a non-empty string');
			return undefined;
		}
		return value;
	}

	number(record: UnknownRecord, key: string, path: string, optional = false): number | undefined {
		const value = record[key];
		if (value === undefined && optional) return undefined;
		if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
			this.issue(`${path}.${key}`, 'expected a finite non-negative number');
			return undefined;
		}
		return value;
	}

	nonNegativeInteger(
		record: UnknownRecord,
		key: string,
		path: string,
		optional = false,
	): number | undefined {
		const value = this.number(record, key, path, optional);
		if (value !== undefined && !Number.isInteger(value)) {
			this.issue(`${path}.${key}`, 'expected an integer');
			return undefined;
		}
		return value;
	}

	positiveInteger(
		record: UnknownRecord,
		key: string,
		path: string,
		optional = false,
	): number | undefined {
		const value = record[key];
		if (value === undefined && optional) return undefined;
		if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
			this.issue(`${path}.${key}`, 'expected a positive integer');
			return undefined;
		}
		return value;
	}

	enum<T extends string>(
		record: UnknownRecord,
		key: string,
		path: string,
		values: readonly T[],
		optional = false,
	): T | undefined {
		const value = record[key];
		if (value === undefined && optional) return undefined;
		if (typeof value !== 'string' || !values.includes(value as T)) {
			this.issue(`${path}.${key}`, `expected one of: ${values.join(', ')}`);
			return undefined;
		}
		return value as T;
	}

	strings(
		record: UnknownRecord,
		key: string,
		path: string,
		options: { optional?: boolean; min?: number } = {},
	): string[] | undefined {
		const value = record[key];
		if (value === undefined && options.optional) return undefined;
		if (!Array.isArray(value)) {
			this.issue(`${path}.${key}`, 'expected an array of strings');
			return undefined;
		}
		let valid = true;
		for (let index = 0; index < value.length; index++) {
			if (typeof value[index] !== 'string' || value[index].length === 0) {
				this.issue(`${path}.${key}[${index}]`, 'expected a non-empty string');
				valid = false;
			}
		}
		if (value.length < (options.min ?? 0)) {
			this.issue(`${path}.${key}`, `expected at least ${options.min} item(s)`);
		}
		if (new Set(value).size !== value.length) {
			this.issue(`${path}.${key}`, 'duplicate values are not allowed');
		}
		return valid ? (value as string[]) : undefined;
	}

	recordOfStrings(
		record: UnknownRecord,
		key: string,
		path: string,
		options: { min?: number } = {},
	): Record<string, string> | undefined {
		const value = this.record(record[key], `${path}.${key}`);
		if (value === undefined) return undefined;
		const entries = Object.entries(value);
		if (entries.length < (options.min ?? 0)) {
			this.issue(
				`${path}.${key}`,
				`expected at least ${options.min} entr${options.min === 1 ? 'y' : 'ies'}`,
			);
		}
		let valid = true;
		for (const [entryKey, entryValue] of entries) {
			if (entryKey.length === 0 || typeof entryValue !== 'string' || entryValue.length === 0) {
				this.issue(`${path}.${key}.${entryKey}`, 'expected a non-empty string value');
				valid = false;
			}
		}
		return valid ? (value as Record<string, string>) : undefined;
	}
}

function validateSchemaVersion(
	record: UnknownRecord,
	validator: Validator,
): EvalSchemaVersion | undefined {
	return validator.enum(record, 'schemaVersion', '$', EVAL_SCHEMA_VERSIONS);
}

function normalizedKey(key: string): string {
	return key.toLowerCase().replaceAll(/[_-]/g, '');
}

function rejectPrivateFields(value: unknown, validator: Validator, path = '$'): void {
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index++) {
			rejectPrivateFields(value[index], validator, `${path}[${index}]`);
		}
		return;
	}
	if (value === null || typeof value !== 'object') return;

	for (const [key, child] of Object.entries(value as UnknownRecord)) {
		if (FORBIDDEN_PUBLIC_KEYS.has(normalizedKey(key))) {
			validator.issue(`${path}.${key}`, 'private answer or grader material is forbidden');
		}
		rejectPrivateFields(child, validator, `${path}.${key}`);
	}
}

function validateIdentifier(value: string | undefined, path: string, validator: Validator): void {
	if (value !== undefined && !IDENTIFIER.test(value)) {
		validator.issue(
			path,
			'must contain only lowercase letters, digits, dot, slash, underscore, or dash',
		);
	}
}

function validateDate(value: string | undefined, path: string, validator: Validator): void {
	if (value === undefined) return;
	const [year, month, day] = value.split('-').map(Number);
	const parsed = new Date(Date.UTC(year, month - 1, day));
	if (
		!DATE.test(value) ||
		parsed.getUTCFullYear() !== year ||
		parsed.getUTCMonth() !== month - 1 ||
		parsed.getUTCDate() !== day
	) {
		validator.issue(path, 'expected a valid YYYY-MM-DD date');
	}
}

function validateTimestamp(value: string | undefined, path: string, validator: Validator): void {
	if (value === undefined) return;
	const match = TIMESTAMP.exec(value);
	if (match === null) {
		validator.issue(path, 'expected an ISO 8601 UTC timestamp');
		return;
	}

	const [, rawYear, rawMonth, rawDay, rawHour, rawMinute, rawSecond] = match;
	const [year, month, day, hour, minute, second] = [
		rawYear,
		rawMonth,
		rawDay,
		rawHour,
		rawMinute,
		rawSecond,
	].map(Number);
	const parsed = new Date(0);
	parsed.setUTCFullYear(year, month - 1, day);
	parsed.setUTCHours(hour, minute, second, 0);
	if (
		parsed.getUTCFullYear() !== year ||
		parsed.getUTCMonth() !== month - 1 ||
		parsed.getUTCDate() !== day ||
		parsed.getUTCHours() !== hour ||
		parsed.getUTCMinutes() !== minute ||
		parsed.getUTCSeconds() !== second
	) {
		validator.issue(path, 'expected a valid ISO 8601 UTC timestamp');
	}
}

function validateDigest(value: string | undefined, path: string, validator: Validator): void {
	if (value !== undefined && !SHA256.test(value)) {
		validator.issue(path, 'expected sha256:<64 lowercase hexadecimal characters>');
	}
}

function validateGitCommit(value: string | undefined, path: string, validator: Validator): void {
	if (value !== undefined && !GIT_COMMIT.test(value)) {
		validator.issue(path, 'expected an immutable 40- or 64-character Git commit ID');
	}
}

function validateExactSemver(value: string | undefined, path: string, validator: Validator): void {
	if (value !== undefined && !EXACT_SEMVER.test(value)) {
		validator.issue(path, 'expected an exact semantic version without a range or tag');
	}
}

function validateSpdxExpression(
	value: string | undefined,
	path: string,
	validator: Validator,
): void {
	if (value !== undefined && !isSpdxExpression(value)) {
		validator.issue(path, 'expected an SPDX license identifier or expression');
	}
}

function tokenizeSpdxExpression(value: string): string[] | undefined {
	const tokens: string[] = [];
	let index = 0;
	while (index < value.length) {
		if (/\s/.test(value[index])) {
			index++;
			continue;
		}
		if (value[index] === '(' || value[index] === ')') {
			tokens.push(value[index]);
			index++;
			continue;
		}

		let end = index;
		while (end < value.length && !/[\s()]/.test(value[end])) end++;
		const token = value.slice(index, end);
		if (!['AND', 'OR', 'WITH'].includes(token) && !SPDX_IDENTIFIER.test(token)) {
			return undefined;
		}
		tokens.push(token);
		index = end;
	}
	return tokens.length > 0 ? tokens : undefined;
}

function isSpdxExpression(value: string): boolean {
	const parsedTokens = tokenizeSpdxExpression(value);
	if (parsedTokens === undefined) return false;
	const tokens = parsedTokens;
	let index = 0;
	const isIdentifier = (token: string | undefined): boolean =>
		token !== undefined &&
		!['(', ')', 'AND', 'OR', 'WITH'].includes(token) &&
		SPDX_IDENTIFIER.test(token);

	function parseSimpleExpression(): boolean {
		if (tokens[index] === '(') {
			index++;
			if (!parseOrExpression() || tokens[index] !== ')') return false;
			index++;
			return true;
		}
		if (!isIdentifier(tokens[index])) return false;
		index++;
		if (tokens[index] === 'WITH') {
			index++;
			if (!isIdentifier(tokens[index])) return false;
			index++;
		}
		return true;
	}

	function parseAndExpression(): boolean {
		if (!parseSimpleExpression()) return false;
		while (tokens[index] === 'AND') {
			index++;
			if (!parseSimpleExpression()) return false;
		}
		return true;
	}

	function parseOrExpression(): boolean {
		if (!parseAndExpression()) return false;
		while (tokens[index] === 'OR') {
			index++;
			if (!parseAndExpression()) return false;
		}
		return true;
	}

	return parseOrExpression() && index === tokens.length;
}

function validateRelativePaths(
	paths: readonly string[] | undefined,
	path: string,
	validator: Validator,
): void {
	if (paths === undefined) return;
	for (let index = 0; index < paths.length; index++) {
		const value = paths[index];
		if (
			value.startsWith('/') ||
			value.startsWith('\\') ||
			/^[a-zA-Z]:/.test(value) ||
			value.includes('\\') ||
			value.includes('\0') ||
			value.split('/').includes('..')
		) {
			validator.issue(`${path}[${index}]`, 'expected a safe repository-relative path');
		}
	}
}

function pathIsWithin(path: string, root: string): boolean {
	return root === '.' || path === root || path.startsWith(`${root}/`);
}

function validateAllowedPaths(
	allowedPaths: readonly string[] | undefined,
	writablePaths: readonly string[] | undefined,
	validator: Validator,
): void {
	if (allowedPaths === undefined || writablePaths === undefined) return;
	for (let index = 0; index < allowedPaths.length; index++) {
		if (!writablePaths.some((root) => pathIsWithin(allowedPaths[index], root))) {
			validator.issue(
				`$.prompt.allowedPaths[${index}]`,
				'is not contained by any sandbox writable path',
			);
		}
	}
}

function validatePrompt(value: unknown, validator: Validator): string[] | undefined {
	const record = validator.record(value, '$.prompt');
	if (record === undefined) return undefined;
	validator.keys(record, '$.prompt', ['statement', 'outputType', 'allowedPaths']);
	validator.string(record, 'statement', '$.prompt');
	validator.enum(record, 'outputType', '$.prompt', OUTPUT_TYPES);
	const allowedPaths = validator.strings(record, 'allowedPaths', '$.prompt', { min: 1 });
	validateRelativePaths(allowedPaths, '$.prompt.allowedPaths', validator);
	return allowedPaths;
}

function validateProvenance(
	value: unknown,
	validator: Validator,
	split: DatasetSplit | undefined,
): void {
	const record = validator.record(value, '$.provenance');
	if (record === undefined) return;
	validator.keys(record, '$.provenance', [
		'createdAt',
		'publishedAt',
		'authors',
		'reviewers',
		'sources',
	]);
	validateDate(
		validator.string(record, 'createdAt', '$.provenance'),
		'$.provenance.createdAt',
		validator,
	);
	validateDate(
		validator.string(record, 'publishedAt', '$.provenance', true),
		'$.provenance.publishedAt',
		validator,
	);
	validator.strings(record, 'authors', '$.provenance', { min: 1 });
	validator.strings(record, 'reviewers', '$.provenance', { min: split === 'test' ? 2 : 0 });

	const sources = record.sources;
	if (!Array.isArray(sources) || sources.length === 0) {
		validator.issue('$.provenance.sources', 'expected at least one source record');
		return;
	}
	for (let index = 0; index < sources.length; index++) {
		const path = `$.provenance.sources[${index}]`;
		const source = validator.record(sources[index], path);
		if (source === undefined) continue;
		validator.keys(source, path, ['repository', 'commit', 'license', 'path', 'url', 'attribution']);
		validator.string(source, 'repository', path);
		validateGitCommit(validator.string(source, 'commit', path), `${path}.commit`, validator);
		validateSpdxExpression(validator.string(source, 'license', path), `${path}.license`, validator);
		validator.string(source, 'path', path, true);
		validator.string(source, 'url', path, true);
		validator.string(source, 'attribution', path, true);
	}
}

function validateEnvironment(
	value: unknown,
	validator: Validator,
	schemaVersion: EvalSchemaVersion | undefined,
): void {
	const record = validator.record(value, '$.environment');
	if (record === undefined) return;
	validator.keys(record, '$.environment', [
		'repository',
		'baseCommit',
		'image',
		'platform',
		'node',
		'pnpm',
		'packageVersions',
		'lockfileHash',
		'overlayLockfileHash',
	]);
	validator.string(record, 'repository', '$.environment');
	validateGitCommit(
		validator.string(record, 'baseCommit', '$.environment'),
		'$.environment.baseCommit',
		validator,
	);
	const image = validator.string(record, 'image', '$.environment');
	if (image !== undefined && !IMAGE_BY_DIGEST.test(image)) {
		validator.issue('$.environment.image', 'must be pinned by an immutable sha256 digest');
	}
	const platform = validator.string(record, 'platform', '$.environment');
	if (platform !== undefined && !PLATFORM.test(platform)) {
		validator.issue('$.environment.platform', 'expected an os/architecture platform');
	}
	validateExactSemver(
		validator.string(record, 'node', '$.environment'),
		'$.environment.node',
		validator,
	);
	validateExactSemver(
		validator.string(record, 'pnpm', '$.environment'),
		'$.environment.pnpm',
		validator,
	);
	const packageVersions = validator.recordOfStrings(record, 'packageVersions', '$.environment', {
		min: 1,
	});
	if (packageVersions !== undefined) {
		for (const [name, version] of Object.entries(packageVersions)) {
			validateExactSemver(version, `$.environment.packageVersions.${name}`, validator);
		}
	}
	validateDigest(
		validator.string(record, 'lockfileHash', '$.environment'),
		'$.environment.lockfileHash',
		validator,
	);
	const overlayLockfileHash = validator.string(
		record,
		'overlayLockfileHash',
		'$.environment',
		true,
	);
	validateDigest(overlayLockfileHash, '$.environment.overlayLockfileHash', validator);
	if (overlayLockfileHash !== undefined && schemaVersion === '1.0') {
		validator.issue('$.environment.overlayLockfileHash', 'requires schema 1.1');
	}
}

function validateWorkspace(value: unknown, validator: Validator): void {
	if (value === undefined) return;
	const path = '$.workspace';
	const record = validator.record(value, path);
	if (record === undefined) return;
	validator.keys(record, path, ['kind', 'templatePath', 'templateDigest']);
	validator.enum(record, 'kind', path, ['template'] as const);
	const templatePath = validator.string(record, 'templatePath', path);
	validateRelativePaths(
		templatePath === undefined ? undefined : [templatePath],
		`${path}.templatePath`,
		validator,
	);
	validateDigest(
		validator.string(record, 'templateDigest', path),
		`${path}.templateDigest`,
		validator,
	);
}

function validateTrainingArtifacts(value: unknown, validator: Validator): void {
	if (value === undefined) return;
	const path = '$.trainingArtifacts';
	const record = validator.record(value, path);
	if (record === undefined) return;
	validator.keys(record, path, ['referencePath', 'referenceDigest']);
	const referencePath = validator.string(record, 'referencePath', path);
	validateRelativePaths(
		referencePath === undefined ? undefined : [referencePath],
		`${path}.referencePath`,
		validator,
	);
	validateDigest(
		validator.string(record, 'referenceDigest', path),
		`${path}.referenceDigest`,
		validator,
	);
}

function validateContext(
	value: unknown,
	validator: Validator,
	schemaVersion: EvalSchemaVersion | undefined,
	path = '$.context',
): { mode?: ContextMode; mcpTools?: string[] } | undefined {
	const record = validator.record(value, path);
	if (record === undefined) return undefined;
	validator.keys(record, path, ['mode', 'docsCommit', 'mcp']);
	const mode = validator.enum(record, 'mode', path, CONTEXT_MODES);
	if (schemaVersion === '1.0' && (mode === 'framework-docs' || mode === 'framework-docs-mcp')) {
		validator.issue(`${path}.mode`, 'framework documentation modes require schema 1.1');
	}
	if (schemaVersion === '1.1' && (mode === 'repo-docs' || mode === 'repo-docs-mcp')) {
		validator.issue(`${path}.mode`, 'repository documentation modes are legacy schema 1.0 modes');
	}
	const docsCommit = validator.string(record, 'docsCommit', path, true);
	validateGitCommit(docsCommit, `${path}.docsCommit`, validator);

	const mcpValue = record.mcp;
	let mcpTools: string[] | undefined;
	if (mcpValue !== undefined) {
		const mcpPath = `${path}.mcp`;
		const mcp = validator.record(mcpValue, mcpPath);
		if (mcp !== undefined) {
			validator.keys(mcp, mcpPath, ['package', 'version', 'tools']);
			validator.string(mcp, 'package', mcpPath);
			validateExactSemver(
				validator.string(mcp, 'version', mcpPath),
				`${mcpPath}.version`,
				validator,
			);
			mcpTools = validator.strings(mcp, 'tools', mcpPath, { min: 1 });
		}
	}

	const isMcpMode = mode === 'repo-docs-mcp' || mode === 'framework-docs-mcp';
	if (isMcpMode && mcpValue === undefined) {
		validator.issue(`${path}.mcp`, 'is required for an MCP-assisted mode');
	}
	if (mode !== undefined && mode !== 'closed-book' && docsCommit === undefined) {
		validator.issue(`${path}.docsCommit`, 'is required for an open-book mode');
	}
	if (mode === 'closed-book' && docsCommit !== undefined) {
		validator.issue(`${path}.docsCommit`, 'must be omitted for closed-book mode');
	}
	if (mode !== undefined && !isMcpMode && mcpValue !== undefined) {
		validator.issue(`${path}.mcp`, 'is only allowed for an MCP-assisted mode');
	}
	return { mode, mcpTools };
}

function validateExecutionLimits(record: UnknownRecord, path: string, validator: Validator): void {
	validator.positiveInteger(record, 'timeoutSeconds', path);
	validator.positiveInteger(record, 'cpu', path);
	validator.positiveInteger(record, 'memoryMb', path);
	validator.positiveInteger(record, 'maxProcesses', path);
	validator.positiveInteger(record, 'maxDiskMb', path);
	validator.positiveInteger(record, 'maxOutputBytes', path);
	validator.positiveInteger(record, 'maxTurns', path);
	validator.positiveInteger(record, 'maxTotalTokens', path);
	validator.nonNegativeInteger(record, 'maxToolCalls', path);
}

const EXECUTION_LIMIT_KEYS = [
	'timeoutSeconds',
	'cpu',
	'memoryMb',
	'maxProcesses',
	'maxDiskMb',
	'maxOutputBytes',
	'maxTurns',
	'maxTotalTokens',
	'maxToolCalls',
] as const;

function validatePolicy(value: unknown, validator: Validator): string[] | undefined {
	const record = validator.record(value, '$.policy');
	if (record === undefined) return undefined;
	validator.keys(record, '$.policy', ['network', ...EXECUTION_LIMIT_KEYS, 'writablePaths']);
	validator.enum(record, 'network', '$.policy', ['none'] as const);
	validateExecutionLimits(record, '$.policy', validator);
	const writablePaths = validator.strings(record, 'writablePaths', '$.policy', { min: 1 });
	validateRelativePaths(writablePaths, '$.policy.writablePaths', validator);
	return writablePaths;
}

function validateGrader(
	value: unknown,
	validator: Validator,
	split: DatasetSplit | undefined,
): void {
	const record = validator.record(value, '$.grader');
	if (record === undefined) return;
	validator.keys(record, '$.grader', [
		'graderVersion',
		'graderDigest',
		'scoringPolicyDigest',
		'publicCommands',
		'hiddenBundleDigest',
	]);
	validator.string(record, 'graderVersion', '$.grader');
	validateDigest(
		validator.string(record, 'graderDigest', '$.grader'),
		'$.grader.graderDigest',
		validator,
	);
	validateDigest(
		validator.string(record, 'scoringPolicyDigest', '$.grader'),
		'$.grader.scoringPolicyDigest',
		validator,
	);
	const publicCommands = record.publicCommands;
	if (!Array.isArray(publicCommands) || publicCommands.length === 0) {
		validator.issue('$.grader.publicCommands', 'expected at least one public command');
	} else {
		const ids: string[] = [];
		for (let index = 0; index < publicCommands.length; index++) {
			const path = `$.grader.publicCommands[${index}]`;
			const command = validator.record(publicCommands[index], path);
			if (command === undefined) continue;
			validator.keys(command, path, ['id', 'command']);
			const id = validator.string(command, 'id', path);
			if (id !== undefined) ids.push(id);
			validator.string(command, 'command', path);
		}
		if (new Set(ids).size !== ids.length) {
			validator.issue('$.grader.publicCommands', 'command IDs must be unique');
		}
	}
	const hiddenBundleDigest = validator.string(record, 'hiddenBundleDigest', '$.grader', true);
	validateDigest(hiddenBundleDigest, '$.grader.hiddenBundleDigest', validator);
	if (split === 'test' && hiddenBundleDigest === undefined) {
		validator.issue('$.grader.hiddenBundleDigest', 'is required for a held-out test task');
	}
}

function parseTaskManifestInternal(value: unknown, publicOnly: boolean): TaskManifest {
	const validator = new Validator();
	rejectPrivateFields(value, validator);
	const record = validator.record(value, '$');
	if (record !== undefined) {
		validator.keys(record, '$', [
			'schemaVersion',
			'benchmarkVersion',
			'taskId',
			'familyId',
			'title',
			'prompt',
			'suite',
			'split',
			'executionMode',
			'capability',
			'packageName',
			'portShape',
			'difficulty',
			'provenance',
			'environment',
			'workspace',
			'trainingArtifacts',
			'context',
			'policy',
			'grader',
			'tags',
		]);
		const schemaVersion = validateSchemaVersion(record, validator);
		validator.string(record, 'benchmarkVersion', '$');
		const taskId = validator.string(record, 'taskId', '$');
		const familyId = validator.string(record, 'familyId', '$');
		validateIdentifier(taskId, '$.taskId', validator);
		validateIdentifier(familyId, '$.familyId', validator);
		validator.string(record, 'title', '$');
		const suite = validator.enum(record, 'suite', '$', EVAL_SUITES);
		const split = validator.enum(record, 'split', '$', DATASET_SPLITS);
		validator.enum(record, 'executionMode', '$', EXECUTION_MODES);
		validator.enum(record, 'capability', '$', CAPABILITIES);
		const packageName = validator.string(record, 'packageName', '$', true);
		const portShape = validator.enum(record, 'portShape', '$', PORT_SHAPES, true);
		validator.enum(record, 'difficulty', '$', DIFFICULTIES, true);
		validator.strings(record, 'tags', '$', { optional: true });

		if (suite === 'integration' && portShape === undefined) {
			validator.issue('$.portShape', 'is required for integration tasks');
		}
		if (suite === 'integration' && packageName === undefined) {
			validator.issue('$.packageName', 'is required for integration tasks');
		}
		if (suite !== undefined && suite !== 'integration' && portShape !== undefined) {
			validator.issue('$.portShape', 'is only allowed for integration tasks');
		}
		if (suite !== undefined && suite !== 'integration' && packageName !== undefined) {
			validator.issue('$.packageName', 'is only allowed for integration tasks');
		}
		if (publicOnly && split === 'test') {
			validator.issue('$.split', 'held-out test tasks cannot be parsed as public material');
		}

		const allowedPaths = validatePrompt(record.prompt, validator);
		validateProvenance(record.provenance, validator, split);
		validateEnvironment(record.environment, validator, schemaVersion);
		validateWorkspace(record.workspace, validator);
		validateTrainingArtifacts(record.trainingArtifacts, validator);
		if (schemaVersion === '1.0' && record.workspace !== undefined) {
			validator.issue('$.workspace', 'requires schema 1.1');
		}
		if (schemaVersion === '1.0' && record.trainingArtifacts !== undefined) {
			validator.issue('$.trainingArtifacts', 'requires schema 1.1');
		}
		if (record.trainingArtifacts !== undefined && split !== 'train') {
			validator.issue('$.trainingArtifacts', 'is only allowed on the train split');
		}
		validateContext(record.context, validator, schemaVersion);
		const writablePaths = validatePolicy(record.policy, validator);
		validateAllowedPaths(allowedPaths, writablePaths, validator);
		validateGrader(record.grader, validator, split);
	}

	if (validator.issues.length > 0)
		throw new SchemaValidationError(
			publicOnly ? 'Public task manifest' : 'Task manifest',
			validator.issues,
		);
	return value as TaskManifest;
}

export function parseTaskManifest(value: unknown): TaskManifest {
	return parseTaskManifestInternal(value, false);
}

export function parsePublicTaskManifest(value: unknown): PublicTaskManifest {
	return parseTaskManifestInternal(value, true) as PublicTaskManifest;
}

function validatePinnedLabel(value: string | undefined, path: string, validator: Validator): void {
	if (
		value !== undefined &&
		(['latest', 'main', 'master', 'current', 'stable'].includes(value.toLowerCase()) ||
			/[\s^~*<>=|]/.test(value))
	) {
		validator.issue(
			path,
			'expected an immutable revision or exact version, not a mutable tag or range',
		);
	}
}

function validateModel(value: unknown, validator: Validator): void {
	const path = '$.model';
	const record = validator.record(value, path);
	if (record === undefined) return;
	validator.keys(record, path, [
		'provider',
		'name',
		'revision',
		'weightsDigest',
		'configurationDigest',
	]);
	validator.string(record, 'provider', path);
	validator.string(record, 'name', path);
	const revision = validator.string(record, 'revision', path);
	validatePinnedLabel(revision, `${path}.revision`, validator);
	validateDigest(
		validator.string(record, 'weightsDigest', path, true),
		`${path}.weightsDigest`,
		validator,
	);
	validateDigest(
		validator.string(record, 'configurationDigest', path),
		`${path}.configurationDigest`,
		validator,
	);
}

function validateHarness(value: unknown, validator: Validator): void {
	const path = '$.harness';
	const record = validator.record(value, path);
	if (record === undefined) return;
	validator.keys(record, path, ['repository', 'commit', 'image']);
	validator.string(record, 'repository', path);
	validateGitCommit(validator.string(record, 'commit', path), `${path}.commit`, validator);
	const image = validator.string(record, 'image', path);
	if (image !== undefined && !IMAGE_BY_DIGEST.test(image)) {
		validator.issue(`${path}.image`, 'must be pinned by an immutable sha256 digest');
	}
}

function validatePromptArtifacts(value: unknown, validator: Validator): void {
	const path = '$.promptArtifacts';
	if (!Array.isArray(value) || value.length === 0) {
		validator.issue(path, 'expected at least one prompt artifact');
		return;
	}
	const roles: string[] = [];
	for (let index = 0; index < value.length; index++) {
		const artifactPath = `${path}[${index}]`;
		const record = validator.record(value[index], artifactPath);
		if (record === undefined) continue;
		validator.keys(record, artifactPath, ['role', 'digest', 'path']);
		const role = validator.enum(record, 'role', artifactPath, PROMPT_ARTIFACT_ROLES);
		if (role !== undefined) roles.push(role);
		validateDigest(
			validator.string(record, 'digest', artifactPath),
			`${artifactPath}.digest`,
			validator,
		);
		const artifactFile = validator.string(record, 'path', artifactPath, true);
		validateRelativePaths(
			artifactFile === undefined ? undefined : [artifactFile],
			`${artifactPath}.path`,
			validator,
		);
	}
	if (new Set(roles).size !== roles.length) {
		validator.issue(path, 'prompt artifact roles must be unique');
	}
	for (const requiredRole of ['system', 'user-template'] as const) {
		if (!roles.includes(requiredRole)) {
			validator.issue(path, `must include a ${requiredRole} artifact`);
		}
	}
}

function validateTools(value: unknown, validator: Validator): string[] | undefined {
	const path = '$.tools';
	if (!Array.isArray(value)) {
		validator.issue(path, 'expected an array');
		return undefined;
	}
	const names: string[] = [];
	for (let index = 0; index < value.length; index++) {
		const toolPath = `${path}[${index}]`;
		const record = validator.record(value[index], toolPath);
		if (record === undefined) continue;
		validator.keys(record, toolPath, [
			'name',
			'version',
			'definitionDigest',
			'configurationDigest',
		]);
		const name = validator.string(record, 'name', toolPath);
		if (name !== undefined) names.push(name);
		const version = validator.string(record, 'version', toolPath);
		validatePinnedLabel(version, `${toolPath}.version`, validator);
		validateDigest(
			validator.string(record, 'definitionDigest', toolPath),
			`${toolPath}.definitionDigest`,
			validator,
		);
		validateDigest(
			validator.string(record, 'configurationDigest', toolPath),
			`${toolPath}.configurationDigest`,
			validator,
		);
	}
	if (new Set(names).size !== names.length) {
		validator.issue(path, 'tool names must be unique');
	}
	return names;
}

function validateSampling(value: unknown, validator: Validator): void {
	const path = '$.sampling';
	const record = validator.record(value, path);
	if (record === undefined) return;
	validator.keys(record, path, [
		'temperature',
		'topP',
		'seed',
		'reasoningEffort',
		'providerOptionsDigest',
	]);
	const temperature = validator.number(record, 'temperature', path, true);
	if (temperature !== undefined && temperature > 2) {
		validator.issue(`${path}.temperature`, 'must be between 0 and 2');
	}
	const topP = validator.number(record, 'topP', path, true);
	if (topP !== undefined && (topP <= 0 || topP > 1)) {
		validator.issue(`${path}.topP`, 'must be greater than 0 and at most 1');
	}
	validator.nonNegativeInteger(record, 'seed', path, true);
	validator.string(record, 'reasoningEffort', path, true);
	validateDigest(
		validator.string(record, 'providerOptionsDigest', path),
		`${path}.providerOptionsDigest`,
		validator,
	);
}

function validateAttemptPolicy(value: unknown, validator: Validator): void {
	const path = '$.attempts';
	const record = validator.record(value, path);
	if (record === undefined) return;
	validator.keys(record, path, ['attemptsPerTask', 'aggregation']);
	const attemptsPerTask = validator.positiveInteger(record, 'attemptsPerTask', path);
	if (attemptsPerTask !== undefined && attemptsPerTask !== 1) {
		validator.issue(
			`${path}.attemptsPerTask`,
			'schemas 1.0 and 1.1 support exactly one attempt per task',
		);
	}
	const aggregation = validator.string(record, 'aggregation', path);
	if (aggregation !== undefined && aggregation !== 'pass@1') {
		validator.issue(`${path}.aggregation`, 'schemas 1.0 and 1.1 support only pass@1');
	}
}

export function parseEvaluationRunManifest(value: unknown): EvaluationRunManifest {
	const validator = new Validator();
	const record = validator.record(value, '$');
	if (record !== undefined) {
		validator.keys(record, '$', [
			'schemaVersion',
			'runId',
			'createdAt',
			'benchmarkVersion',
			'taskManifestDigest',
			'scoringPolicyDigest',
			'executionMode',
			'context',
			'model',
			'harness',
			'promptArtifacts',
			'tools',
			'sampling',
			'limits',
			'attempts',
		]);
		const schemaVersion = validateSchemaVersion(record, validator);
		const runId = validator.string(record, 'runId', '$');
		validateIdentifier(runId, '$.runId', validator);
		validateTimestamp(validator.string(record, 'createdAt', '$'), '$.createdAt', validator);
		validator.string(record, 'benchmarkVersion', '$');
		validateDigest(
			validator.string(record, 'taskManifestDigest', '$'),
			'$.taskManifestDigest',
			validator,
		);
		validateDigest(
			validator.string(record, 'scoringPolicyDigest', '$'),
			'$.scoringPolicyDigest',
			validator,
		);
		validator.enum(record, 'executionMode', '$', EXECUTION_MODES);
		const context = validateContext(record.context, validator, schemaVersion);
		validateModel(record.model, validator);
		validateHarness(record.harness, validator);
		validatePromptArtifacts(record.promptArtifacts, validator);
		const toolNames = validateTools(record.tools, validator);
		for (const mcpTool of context?.mcpTools ?? []) {
			if (!toolNames?.includes(mcpTool)) {
				validator.issue('$.tools', `missing immutable definition for MCP tool ${mcpTool}`);
			}
		}
		validateSampling(record.sampling, validator);
		const limits = validator.record(record.limits, '$.limits');
		if (limits !== undefined) {
			validator.keys(limits, '$.limits', EXECUTION_LIMIT_KEYS);
			validateExecutionLimits(limits, '$.limits', validator);
		}
		validateAttemptPolicy(record.attempts, validator);
	}

	if (validator.issues.length > 0)
		throw new SchemaValidationError('Evaluation run manifest', validator.issues);
	return value as EvaluationRunManifest;
}

export function parsePrediction(value: unknown): Prediction {
	const validator = new Validator();
	const record = validator.record(value, '$');
	if (record !== undefined) {
		validator.keys(record, '$', [
			'schemaVersion',
			'runId',
			'runManifestDigest',
			'taskId',
			'outputType',
			'output',
			'attempt',
			'createdAt',
		]);
		validateSchemaVersion(record, validator);
		const runId = validator.string(record, 'runId', '$');
		validateIdentifier(runId, '$.runId', validator);
		validateDigest(
			validator.string(record, 'runManifestDigest', '$'),
			'$.runManifestDigest',
			validator,
		);
		const taskId = validator.string(record, 'taskId', '$');
		validateIdentifier(taskId, '$.taskId', validator);
		validator.enum(record, 'outputType', '$', OUTPUT_TYPES);
		validator.string(record, 'output', '$');
		const attempt = validator.positiveInteger(record, 'attempt', '$');
		if (attempt !== undefined && attempt !== 1) {
			validator.issue('$.attempt', 'schemas 1.0 and 1.1 support exactly one attempt per task');
		}
		validateTimestamp(validator.string(record, 'createdAt', '$', true), '$.createdAt', validator);
	}

	if (validator.issues.length > 0) throw new SchemaValidationError('Prediction', validator.issues);
	return value as Prediction;
}

function validateMetrics(value: unknown, validator: Validator): UnknownRecord | undefined {
	const record = validator.record(value, '$.metrics');
	if (record === undefined) return undefined;
	validator.keys(record, '$.metrics', [
		'targetPassed',
		'targetTotal',
		'regressionPassed',
		'regressionTotal',
		'inputTokens',
		'outputTokens',
		'cachedInputTokens',
		'reasoningTokens',
		'turns',
		'toolCalls',
		'costUsd',
	]);
	for (const key of [
		'targetPassed',
		'targetTotal',
		'regressionPassed',
		'regressionTotal',
		'cachedInputTokens',
		'reasoningTokens',
	] as const) {
		validator.nonNegativeInteger(record, key, '$.metrics', true);
	}
	validator.nonNegativeInteger(record, 'inputTokens', '$.metrics');
	validator.nonNegativeInteger(record, 'outputTokens', '$.metrics');
	validator.nonNegativeInteger(record, 'turns', '$.metrics');
	validator.nonNegativeInteger(record, 'toolCalls', '$.metrics');
	validator.number(record, 'costUsd', '$.metrics', true);

	for (const [passedKey, totalKey] of [
		['targetPassed', 'targetTotal'],
		['regressionPassed', 'regressionTotal'],
	] as const) {
		const passed = record[passedKey];
		const total = record[totalKey];
		if ((passed === undefined) !== (total === undefined)) {
			validator.issue(`$.metrics.${passedKey}`, `must be provided together with ${totalKey}`);
		}
		if (typeof passed === 'number' && typeof total === 'number' && passed > total) {
			validator.issue(`$.metrics.${passedKey}`, `cannot exceed ${totalKey}`);
		}
	}
	return record;
}

function validateCommands(value: unknown, validator: Validator): UnknownRecord[] | undefined {
	if (!Array.isArray(value)) {
		validator.issue('$.commands', 'expected an array');
		return undefined;
	}
	const ids: string[] = [];
	const records: UnknownRecord[] = [];
	for (let index = 0; index < value.length; index++) {
		const path = `$.commands[${index}]`;
		const record = validator.record(value[index], path);
		if (record === undefined) continue;
		records.push(record);
		validator.keys(record, path, ['id', 'phase', 'outcome', 'durationMs', 'exitCode']);
		const id = validator.string(record, 'id', path);
		if (id !== undefined) ids.push(id);
		validator.enum(record, 'phase', path, COMMAND_PHASES);
		const outcome = validator.enum(record, 'outcome', path, COMMAND_OUTCOMES);
		validator.number(record, 'durationMs', path);
		const exitCode = validator.nonNegativeInteger(record, 'exitCode', path, true);
		if (outcome === 'passed' && exitCode !== undefined && exitCode !== 0) {
			validator.issue(`${path}.exitCode`, 'must be zero for a passed command');
		}
		if (outcome === 'skipped' && exitCode !== undefined) {
			validator.issue(`${path}.exitCode`, 'must be omitted for a skipped command');
		}
	}
	if (new Set(ids).size !== ids.length) {
		validator.issue('$.commands', 'command IDs must be unique');
	}
	return records;
}

export function parseEvaluationResult(value: unknown): EvaluationResult {
	const validator = new Validator();
	const record = validator.record(value, '$');
	if (record !== undefined) {
		validator.keys(record, '$', [
			'schemaVersion',
			'runId',
			'runManifestDigest',
			'benchmarkVersion',
			'taskManifestDigest',
			'taskId',
			'attempt',
			'outcome',
			'failureStage',
			'stopReason',
			'durationMs',
			'graderVersion',
			'graderDigest',
			'scoringPolicyDigest',
			'environmentDigest',
			'predictionDigest',
			'metrics',
			'commands',
		]);
		validateSchemaVersion(record, validator);
		const runId = validator.string(record, 'runId', '$');
		validateIdentifier(runId, '$.runId', validator);
		validateDigest(
			validator.string(record, 'runManifestDigest', '$'),
			'$.runManifestDigest',
			validator,
		);
		validator.string(record, 'benchmarkVersion', '$');
		validateDigest(
			validator.string(record, 'taskManifestDigest', '$'),
			'$.taskManifestDigest',
			validator,
		);
		const taskId = validator.string(record, 'taskId', '$');
		validateIdentifier(taskId, '$.taskId', validator);
		const attempt = validator.positiveInteger(record, 'attempt', '$');
		if (attempt !== undefined && attempt !== 1) {
			validator.issue('$.attempt', 'schemas 1.0 and 1.1 support exactly one attempt per task');
		}
		const outcome = validator.enum(record, 'outcome', '$', RESULT_OUTCOMES);
		const failureStage = validator.enum(record, 'failureStage', '$', FAILURE_STAGES, true);
		const stopReason = validator.enum(record, 'stopReason', '$', STOP_REASONS);
		validator.number(record, 'durationMs', '$');
		validator.string(record, 'graderVersion', '$');
		validateDigest(validator.string(record, 'graderDigest', '$'), '$.graderDigest', validator);
		validateDigest(
			validator.string(record, 'scoringPolicyDigest', '$'),
			'$.scoringPolicyDigest',
			validator,
		);
		validateDigest(
			validator.string(record, 'environmentDigest', '$'),
			'$.environmentDigest',
			validator,
		);
		validateDigest(
			validator.string(record, 'predictionDigest', '$'),
			'$.predictionDigest',
			validator,
		);
		const metrics = validateMetrics(record.metrics, validator);
		const commands = validateCommands(record.commands, validator);

		if (outcome === 'resolved' && failureStage !== undefined) {
			validator.issue('$.failureStage', 'must be omitted for a resolved result');
		}
		if (outcome !== undefined && outcome !== 'resolved' && failureStage === undefined) {
			validator.issue('$.failureStage', 'is required for an unresolved or error result');
		}
		if (outcome === 'resolved' && stopReason !== undefined && stopReason !== 'completed') {
			validator.issue('$.stopReason', 'must be completed for a resolved result');
		}
		if (outcome === 'resolved') {
			for (let index = 0; index < (commands?.length ?? 0); index++) {
				if (commands?.[index].outcome !== 'passed') {
					validator.issue(`$.commands[${index}].outcome`, 'must be passed for a resolved result');
				}
			}
			for (const [passedKey, totalKey] of [
				['targetPassed', 'targetTotal'],
				['regressionPassed', 'regressionTotal'],
			] as const) {
				const passed = metrics?.[passedKey];
				const total = metrics?.[totalKey];
				if (typeof passed === 'number' && typeof total === 'number' && passed !== total) {
					validator.issue(`$.metrics.${passedKey}`, `must equal ${totalKey} for a resolved result`);
				}
			}
		}
	}

	if (validator.issues.length > 0)
		throw new SchemaValidationError('Evaluation result', validator.issues);
	return value as EvaluationResult;
}
