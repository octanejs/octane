// Build the bounded list's real-native Lynx bundle with the repository's own
// Rspeedy integration. Sources are staged under the plugin example tree so
// workspace packages and the pinned Lynx toolchain resolve exactly as they do
// for the established eager-table fixture.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '../..');
const STAGE_NAME = 'lynx-list-bench';
export const SUPPORTED_LOGICAL_ROW_COUNTS = Object.freeze([1_000, 10_000]);
const SUPPORTED_LOGICAL_ROW_COUNT_STRINGS = new Set(SUPPORTED_LOGICAL_ROW_COUNTS.map(String));

export function resolveListLogicalRowCount(value = process.env.BENCH_LIST_ROWS ?? '10000') {
	const selected = String(value);
	if (!SUPPORTED_LOGICAL_ROW_COUNT_STRINGS.has(selected)) {
		throw new Error(
			`BENCH_LIST_ROWS must be exactly ${SUPPORTED_LOGICAL_ROW_COUNTS.join(' or ')}.`,
		);
	}
	return Number(selected);
}

export function buildListApp({
	silent = false,
	logicalRowCount = resolveListLogicalRowCount(),
} = {}) {
	if (!SUPPORTED_LOGICAL_ROW_COUNTS.includes(logicalRowCount)) {
		throw new Error(
			`logicalRowCount must be exactly ${SUPPORTED_LOGICAL_ROW_COUNTS.join(' or ')}.`,
		);
	}
	const pluginDir = path.join(repo, 'packages/rspeedy-plugin-octane');
	const appDir = path.join(root, 'app');
	const stage = path.join(pluginDir, 'examples', STAGE_NAME);
	const output = path.join(appDir, 'dist', `rows-${logicalRowCount}`);

	fs.rmSync(stage, { recursive: true, force: true });
	fs.mkdirSync(path.join(stage, 'src'), { recursive: true });
	for (const file of ['lynx.config.mjs', 'tsconfig.json']) {
		fs.copyFileSync(path.join(appDir, file), path.join(stage, file));
	}
	for (const file of fs.readdirSync(path.join(appDir, 'src'))) {
		fs.copyFileSync(path.join(appDir, 'src', file), path.join(stage, 'src', file));
	}
	const stagedData = path.join(stage, 'src/data.ts');
	const dataSource = fs.readFileSync(stagedData, 'utf8');
	const logicalRowDeclaration = /^export const LOGICAL_ROW_COUNT = 10_000;$/m;
	const logicalRowDeclarations = dataSource.match(/^export const LOGICAL_ROW_COUNT = 10_000;$/gm);
	if ((logicalRowDeclarations ?? []).length !== 1) {
		throw new Error('bounded Native list row-count declaration is missing or ambiguous.');
	}
	fs.writeFileSync(
		stagedData,
		dataSource.replace(
			logicalRowDeclaration,
			`export const LOGICAL_ROW_COUNT = ${logicalRowCount};`,
		),
	);

	if (!silent) {
		console.log(`[lynx-list] building ${logicalRowCount}-row bounded Native app (production)…`);
	}
	try {
		execFileSync(
			'npx',
			['rspeedy', 'build', '--root', `examples/${STAGE_NAME}`, '--environment', 'lynx'],
			{
				cwd: pluginDir,
				stdio: silent ? 'pipe' : 'inherit',
				env: { ...process.env, NODE_ENV: 'production' },
			},
		);
		const stagedOutput = path.join(stage, 'dist');
		const nativeBundle = path.join(stagedOutput, 'main.lynx.bundle');
		if (!fs.existsSync(nativeBundle)) {
			throw new Error(`Rspeedy did not emit the bounded Native bundle at ${nativeBundle}.`);
		}
		fs.rmSync(output, { recursive: true, force: true });
		fs.cpSync(stagedOutput, output, { recursive: true });
	} finally {
		fs.rmSync(stage, { recursive: true, force: true });
	}

	if (!silent) {
		console.log(`[lynx-list] staged main.lynx.bundle → app/dist/rows-${logicalRowCount}`);
	}
	return output;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) buildListApp();
