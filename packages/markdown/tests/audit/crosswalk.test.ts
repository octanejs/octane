import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

type RuntimeTest = { id: string; file: string; fullName: string };
type Crosswalk = {
	schemaVersion: number;
	cases: Array<{
		upstreamId: string;
		upstreamTitle: string;
		requiredTokens: string[];
		declarationEvidence: {
			declaration: string;
			kind: 'line' | 'block' | 'parameter-row';
			blockSha256: string;
			ownerBlockSha256?: string | null;
			templateSha256?: string | null;
			callbackSha256?: string | null;
			rowIndex?: number | null;
		};
		identityEvidence: { runtimeId: string; ownershipSha256: string };
		adapted: Array<RuntimeTest & { sourceSha256: string }>;
	}>;
};

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const read = <T>(path: string): T => JSON.parse(readFileSync(join(repoRoot, path), 'utf8')) as T;
const upstream = read<{ cases: Array<{ id: string; title: string }> }>(
	'packages/markdown/audit/test-inventory.json',
);
const adapted = read<{ tests: RuntimeTest[] }>('packages/markdown/audit/adapted-runtime.json');
const crosswalk = read<Crosswalk>('packages/markdown/audit/adapted-case-crosswalk.json');
const parameterRows = read<
	Record<string, { template: string; rowIndex: number; rowSha256: string }>
>('packages/markdown/audit/parameter-row-map.json');

function staticParameterValue(node: ts.Expression): unknown {
	while (
		ts.isAsExpression(node) ||
		ts.isParenthesizedExpression(node) ||
		ts.isSatisfiesExpression(node)
	)
		node = node.expression;
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
	if (ts.isNumericLiteral(node)) return Number(node.text);
	if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
	if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
	if (node.kind === ts.SyntaxKind.NullKeyword) return null;
	if (ts.isIdentifier(node) && node.text === 'undefined') return undefined;
	throw new Error(`parameterized title uses a non-static value: ${node.getText()}`);
}

function expandParameterizedTitle(template: string, row: ts.Expression): string {
	const values = ts.isArrayLiteralExpression(row) ? row.elements : [row];
	let index = 0;
	const expanded = template.replace(/%[sj]/g, (placeholder) => {
		if (index >= values.length) throw new Error(`missing parameter title value: ${template}`);
		const value = staticParameterValue(values[index++] as ts.Expression);
		if (placeholder === '%j') {
			const json = JSON.stringify(value);
			return json === undefined ? 'undefined' : json;
		}
		return String(value);
	});
	if (index === 0) throw new Error(`unsupported parameter title template: ${template}`);
	return expanded;
}

function regenerateCrosswalkWithSource(
	path: string,
	changed: string,
	parameterMap: typeof parameterRows | undefined = undefined,
) {
	const temporary = mkdtempSync(join(tmpdir(), 'react-markdown-crosswalk-'));
	const override = join(temporary, 'source-override.ts');
	writeFileSync(override, changed);
	const parameterMapOverride = join(temporary, 'parameter-row-map.json');
	if (parameterMap) writeFileSync(parameterMapOverride, JSON.stringify(parameterMap));
	try {
		return spawnSync(process.execPath, ['scripts/react-parity/react-markdown-crosswalk.mjs'], {
			cwd: repoRoot,
			env: {
				...process.env,
				OCTANE_REACT_MARKDOWN_SOURCE_OVERRIDE_PATH: path,
				OCTANE_REACT_MARKDOWN_SOURCE_OVERRIDE_FILE: override,
				...(parameterMap
					? { OCTANE_REACT_MARKDOWN_PARAMETER_MAP_OVERRIDE_FILE: parameterMapOverride }
					: {}),
			},
			encoding: 'utf8',
		});
	} finally {
		rmSync(temporary, { recursive: true, force: true });
	}
}

function validate(
	value: Crosswalk,
	loadSource = (path: string) => readFileSync(join(repoRoot, path)),
	runtimeTests = adapted.tests,
) {
	const expected = new Map(upstream.cases.map((test) => [test.id, test.title]));
	const available = new Map<string, RuntimeTest>();
	const availableNames = new Set<string>();
	for (const test of runtimeTests) {
		if (available.has(test.id)) throw new Error(`duplicate adapted runtime id: ${test.id}`);
		if (availableNames.has(test.fullName))
			throw new Error(`duplicate adapted full name: ${test.fullName}`);
		available.set(test.id, test);
		availableNames.add(test.fullName);
	}
	const seen = new Set<string>();
	const ownedAdaptedIds = new Map<string, string>();
	if (value.schemaVersion !== 2) throw new Error('crosswalk schema drifted');
	for (const entry of value.cases) {
		if (seen.has(entry.upstreamId)) throw new Error(`duplicate upstream id: ${entry.upstreamId}`);
		seen.add(entry.upstreamId);
		if (expected.get(entry.upstreamId) !== entry.upstreamTitle)
			throw new Error(`upstream identity drifted: ${entry.upstreamId}`);
		if (entry.adapted.length === 0)
			throw new Error(`missing adapted evidence: ${entry.upstreamId}`);
		for (const evidence of entry.adapted) {
			const existingOwner = ownedAdaptedIds.get(evidence.id);
			if (existingOwner)
				throw new Error(
					`adapted runtime identity ${evidence.id} is owned by multiple upstream identities: ${existingOwner}, ${entry.upstreamId}`,
				);
			ownedAdaptedIds.set(evidence.id, entry.upstreamId);
			const { sourceSha256, ...identity } = evidence;
			if (JSON.stringify(available.get(evidence.id)) !== JSON.stringify(identity))
				throw new Error(`adapted identity drifted: ${evidence.id}`);
			const actual = createHash('sha256').update(loadSource(evidence.file)).digest('hex');
			if (actual !== sourceSha256)
				throw new Error(`adapted assertion source drifted: ${evidence.id}`);
			if (entry.identityEvidence.runtimeId !== evidence.id)
				throw new Error(`identity ownership runtime drifted: ${entry.upstreamId}`);
			const ownership = createHash('sha256')
				.update(
					[entry.upstreamId, evidence.id, evidence.file, evidence.fullName, sourceSha256].join(
						'\0',
					),
				)
				.digest('hex');
			if (ownership !== entry.identityEvidence.ownershipSha256)
				throw new Error(`identity ownership evidence drifted: ${entry.upstreamId}`);
			const text = loadSource(evidence.file).toString();
			for (const token of entry.requiredTokens) {
				if (!text.includes(token)) throw new Error(`missing required scenario token: ${token}`);
			}
			if (entry.declarationEvidence) {
				if (
					entry.declarationEvidence.kind !== 'parameter-row' &&
					!evidence.fullName.includes(entry.declarationEvidence.declaration)
				)
					throw new Error(`adapted identity does not own declaration: ${evidence.id}`);
				const start = text.indexOf(entry.declarationEvidence.declaration);
				const ends = [text.indexOf('\n\t});', start), text.indexOf('\n});', start)].filter(
					(value) => value >= 0,
				);
				const end = Math.min(...ends);
				if (start < 0 || (entry.declarationEvidence.kind === 'block' && !Number.isFinite(end)))
					throw new Error('missing identity declaration block');
				if (text.indexOf(entry.declarationEvidence.declaration, start + 1) >= 0)
					throw new Error('ambiguous identity declaration block');
				const material =
					entry.declarationEvidence.kind !== 'block'
						? text.slice(text.lastIndexOf('\n', start) + 1, text.indexOf('\n', start))
						: text.slice(start, end + 5);
				const actualBlock = createHash('sha256').update(material).digest('hex');
				if (
					entry.declarationEvidence.kind !== 'parameter-row' &&
					actualBlock !== entry.declarationEvidence.blockSha256
				)
					throw new Error(`adapted declaration block drifted: ${evidence.id}`);
				if (entry.declarationEvidence.kind === 'parameter-row') {
					const source = ts.createSourceFile(
						evidence.file,
						text,
						ts.ScriptTarget.Latest,
						true,
						ts.ScriptKind.TSX,
					);
					let parts:
						| {
								row: string;
								rowNode: ts.Expression;
								rowIndex: number;
								template: string;
								callback: string;
						  }
						| undefined;
					const unwrap = (value: ts.Expression): ts.Expression => {
						while (
							ts.isAsExpression(value) ||
							ts.isParenthesizedExpression(value) ||
							ts.isSatisfiesExpression(value)
						)
							value = value.expression;
						return value;
					};
					const visit = (node: ts.Node) => {
						if (
							ts.isCallExpression(node) &&
							ts.isCallExpression(node.expression) &&
							ts.isPropertyAccessExpression(node.expression.expression) &&
							node.expression.expression.name.text === 'each'
						) {
							const array = unwrap(node.expression.arguments[0]);
							const template = node.arguments[0];
							if (
								array &&
								ts.isArrayLiteralExpression(array) &&
								template &&
								ts.isStringLiteral(template) &&
								template.text === entry.declarationEvidence.declaration
							) {
								const row = array.elements[entry.declarationEvidence.rowIndex!];
								if (!row || parts || !node.arguments[1])
									throw new Error('ambiguous parameter ownership');
								parts = {
									row: row.getFullText(source),
									rowNode: row as ts.Expression,
									rowIndex: entry.declarationEvidence.rowIndex!,
									template: template.getFullText(source),
									callback: node.arguments[1].getFullText(source),
								};
							}
						}
						ts.forEachChild(node, visit);
					};
					visit(source);
					if (!parts) throw new Error('missing parameter owner assertion body');
					const expandedTitle = expandParameterizedTitle(
						entry.declarationEvidence.declaration,
						parts.rowNode,
					);
					if (!evidence.fullName.endsWith(expandedTitle))
						throw new Error('parameter row does not produce adapted runtime identity');
					if (
						createHash('sha256').update(parts.row).digest('hex') !==
						entry.declarationEvidence.blockSha256
					)
						throw new Error('parameter row drifted');
					if (
						createHash('sha256').update(parts.template).digest('hex') !==
						entry.declarationEvidence.templateSha256
					)
						throw new Error('parameter template drifted');
					if (
						createHash('sha256').update(parts.callback).digest('hex') !==
						entry.declarationEvidence.callbackSha256
					)
						throw new Error('parameter callback drifted');
					if (parts.rowIndex !== entry.declarationEvidence.rowIndex)
						throw new Error('parameter row ownership index drifted');
				}
			}
		}
	}
	if (seen.size !== expected.size) throw new Error('crosswalk does not cover every upstream case');
}

describe('react-markdown adapted case crosswalk', () => {
	it('maps every pinned source-path/line identity to executable adapted evidence', () => {
		expect(() => validate(crosswalk)).not.toThrow();
		expect(crosswalk.cases).toHaveLength(87);
	});

	it('binds every audited parameter identity, including break and both vbscript rows, fail closed', () => {
		expect(Object.keys(parameterRows)).toHaveLength(54);
		expect(
			crosswalk.cases.filter((entry) => entry.declarationEvidence.kind === 'parameter-row'),
		).toHaveLength(54);
		for (const entry of crosswalk.cases) {
			const binding = parameterRows[entry.adapted[0].id];
			if (entry.declarationEvidence.kind !== 'parameter-row') {
				expect(binding).toBeUndefined();
				continue;
			}
			expect(binding).toBeDefined();
			expect(entry.declarationEvidence).toMatchObject({
				kind: 'parameter-row',
				rowIndex: binding.rowIndex,
			});
			expect(entry.declarationEvidence.blockSha256).toMatch(/^[a-f0-9]{64}$/);
			expect(entry.declarationEvidence.templateSha256).toMatch(/^[a-f0-9]{64}$/);
			expect(entry.declarationEvidence.callbackSha256).toMatch(/^[a-f0-9]{64}$/);
			expect(entry.declarationEvidence.blockSha256).toBe(binding.rowSha256);
		}
		for (const id of [
			'runtime:fda08a631f66e79c',
			'runtime:e69335a396904873',
			'runtime:1f402419ebb612a1',
		])
			expect(parameterRows[id]).toBeDefined();
	});

	it('rejects missing and invented adapted evidence', () => {
		expect(() => validate({ ...crosswalk, cases: crosswalk.cases.slice(1) })).toThrow(
			/does not cover every upstream case/,
		);
		expect(() =>
			validate({
				...crosswalk,
				cases: [
					{
						...crosswalk.cases[0],
						adapted: [{ id: 'invented', file: 'x', fullName: 'x', sourceSha256: '0'.repeat(64) }],
					},
					...crosswalk.cases.slice(1),
				],
			}),
		).toThrow(/adapted identity drifted/);
	});

	it('rejects weakened assertion source without relying on a renamed test', () => {
		const target = crosswalk.cases[0].adapted[0];
		expect(() =>
			validate(crosswalk, (path) => {
				const source = readFileSync(join(repoRoot, path));
				return path === target.file
					? Buffer.from(source.toString().replace('expect(', 'void('))
					: source;
			}),
		).toThrow(/adapted assertion source drifted/);
	});

	it('rejects duplicate upstream ids and duplicate adapted identities', () => {
		expect(() =>
			validate({ ...crosswalk, cases: [crosswalk.cases[0], ...crosswalk.cases] }),
		).toThrow(/duplicate upstream id/);
		const duplicateId = [...adapted.tests, { ...adapted.tests[1], id: adapted.tests[0].id }];
		expect(() => validate(crosswalk, undefined, duplicateId)).toThrow(
			/duplicate adapted runtime id/,
		);
		const duplicateName = [
			...adapted.tests,
			{
				...adapted.tests[1],
				id: 'runtime:duplicate-name-control',
				fullName: adapted.tests[0].fullName,
			},
		];
		expect(() => validate(crosswalk, undefined, duplicateName)).toThrow(
			/duplicate adapted full name/,
		);
	});

	it('rejects one adapted runtime identity owning multiple upstream identities after rehashing', () => {
		const duplicated = structuredClone(crosswalk);
		const source = duplicated.cases[0];
		const target = duplicated.cases[1];
		target.adapted = structuredClone(source.adapted);
		target.identityEvidence.runtimeId = source.adapted[0].id;
		target.identityEvidence.ownershipSha256 = createHash('sha256')
			.update(
				[
					target.upstreamId,
					source.adapted[0].id,
					source.adapted[0].file,
					source.adapted[0].fullName,
					source.adapted[0].sourceSha256,
				].join('\0'),
			)
			.digest('hex');
		expect(() => validate(duplicated)).toThrow(/owned by multiple upstream identities/);
	});

	it('rejects scenario evidence missing its required fixture, plugin, or assertion', () => {
		const scenario = crosswalk.cases.find((entry) => entry.requiredTokens.length > 0)!;
		const token = scenario.requiredTokens[0];
		expect(() =>
			validate(crosswalk, (path) => {
				const source = readFileSync(join(repoRoot, path));
				return path === scenario.adapted[0].file
					? Buffer.from(source.toString().replaceAll(token, 'removed-scenario-token'))
					: source;
			}),
		).toThrow(/adapted assertion source drifted|missing required scenario token/);
	});

	it('rejects remapping scenario ownership to another runtime identity in the same file', () => {
		const scenario = crosswalk.cases.find(
			(entry) => adapted.tests.filter((test) => test.file === entry.adapted[0].file).length > 1,
		)!;
		const replacement = adapted.tests.find(
			(test) => test.file === scenario.adapted[0].file && test.id !== scenario.adapted[0].id,
		)!;
		const remapped = structuredClone(crosswalk);
		const target = remapped.cases.find((entry) => entry.upstreamId === scenario.upstreamId)!;
		target.adapted = [{ ...replacement, sourceSha256: target.adapted[0].sourceSha256 }];
		expect(() => validate(remapped)).toThrow(
			/identity ownership runtime drifted|adapted identity does not own declaration/,
		);
	});

	it('rejects remapping boolean, allowed, and unwrap ownership to same-file tests', () => {
		for (const upstreamId of [
			'test.jsx:66:should throw w/ non-string children (boolean)',
			'test.jsx:424:should support `allowedElements` (drop unlisted nodes)',
			'test.jsx:476:should support `unwrapDisallowed` w/ `allowedElements`',
		]) {
			const remapped = structuredClone(crosswalk);
			const target = remapped.cases.find((entry) => entry.upstreamId === upstreamId)!;
			const replacement = adapted.tests.find(
				(test) => test.file === target.adapted[0].file && test.id !== target.adapted[0].id,
			)!;
			target.adapted = [{ ...replacement, sourceSha256: target.adapted[0].sourceSha256 }];
			expect(() => validate(remapped)).toThrow(
				/identity ownership runtime drifted|owned by multiple upstream identities/,
			);
		}
	});

	it('rejects a same-file remap for every crosswalk entry that has an alternate runtime identity', () => {
		let exercised = 0;
		for (const scenario of crosswalk.cases) {
			const replacement = adapted.tests.find(
				(test) => test.file === scenario.adapted[0].file && test.id !== scenario.adapted[0].id,
			);
			if (!replacement) continue;
			exercised++;
			const remapped = structuredClone(crosswalk);
			const target = remapped.cases.find((entry) => entry.upstreamId === scenario.upstreamId)!;
			target.adapted = [{ ...replacement, sourceSha256: target.adapted[0].sourceSha256 }];
			expect(() => validate(remapped)).toThrow(
				/identity ownership runtime drifted|owned by multiple upstream identities/,
			);
		}
		expect(exercised).toBeGreaterThan(0);
	}, 20_000);

	it('rejects parameter-row mutation independently of file and runtime ownership hashes', () => {
		const scenario = crosswalk.cases.find(
			(entry) => entry.declarationEvidence.kind === 'parameter-row',
		)!;
		const mutated = structuredClone(crosswalk);
		const target = mutated.cases.find((entry) => entry.upstreamId === scenario.upstreamId)!;
		const original = readFileSync(join(repoRoot, target.adapted[0].file)).toString();
		const changed = original.replace(
			target.declarationEvidence.declaration,
			'mutated-parameter-row',
		);
		const sourceSha256 = createHash('sha256').update(changed).digest('hex');
		target.adapted[0].sourceSha256 = sourceSha256;
		target.identityEvidence.ownershipSha256 = createHash('sha256')
			.update(
				[
					target.upstreamId,
					target.adapted[0].id,
					target.adapted[0].file,
					target.adapted[0].fullName,
					sourceSha256,
				].join('\0'),
			)
			.digest('hex');
		expect(() =>
			validate(mutated, (path) =>
				path === target.adapted[0].file ? Buffer.from(changed) : readFileSync(join(repoRoot, path)),
			),
		).toThrow(/missing identity declaration block|adapted declaration block drifted/);
	});

	it('rejects fixture-only mutation and two-row swap in an as-const matrix', () => {
		const rehash = (value: Crosswalk, path: string, changed: string) => {
			const sourceSha256 = createHash('sha256').update(changed).digest('hex');
			for (const entry of value.cases)
				for (const evidence of entry.adapted)
					if (evidence.file === path) {
						evidence.sourceSha256 = sourceSha256;
						entry.identityEvidence.ownershipSha256 = createHash('sha256')
							.update(
								[
									entry.upstreamId,
									evidence.id,
									evidence.file,
									evidence.fullName,
									sourceSha256,
								].join('\0'),
							)
							.digest('hex');
					}
		};
		for (const [upstreamId, transform] of [
			[
				'test.jsx:88:should support a block quote',
				(source: string) =>
					source.replace(
						"['block quote', '> a', undefined]",
						"['block quote', '> changed', undefined]",
					),
			],
			[
				'test.jsx:88:should support a block quote',
				(source: string) =>
					source.replace(
						"\t\t['block quote', '> a', undefined],\n\t\t['break', 'a\\\\\\nb', undefined],",
						"\t\t['break', 'a\\\\\\nb', undefined],\n\t\t['block quote', '> a', undefined],",
					),
			],
			[
				'test.jsx:95:should support a break',
				(source: string) =>
					source.replace("['break', 'a\\\\\\nb', undefined]", "['break', 'changed', undefined]"),
			],
			[
				'test.jsx:317:should make a `vbscript:` URL safe',
				(source: string) =>
					source.replace(
						"['vbscript URL', '[](vbscript:alert(1))', undefined],\n\t\t['uppercase vbscript URL', '[](VBSCRIPT:alert(1))', undefined],",
						"['uppercase vbscript URL', '[](VBSCRIPT:alert(1))', undefined],\n\t\t['vbscript URL', '[](vbscript:alert(1))', undefined],",
					),
			],
		] as const) {
			const mutated = structuredClone(crosswalk);
			const target = mutated.cases.find((entry) => entry.upstreamId === upstreamId)!;
			const path = target.adapted[0].file;
			const changed = transform(readFileSync(join(repoRoot, path), 'utf8'));
			rehash(mutated, path, changed);
			expect(() =>
				validate(mutated, (file) =>
					file === path ? Buffer.from(changed) : readFileSync(join(repoRoot, file)),
				),
			).toThrow(
				/parameter row drifted|parameter row ownership index drifted|parameter row does not produce adapted runtime identity/,
			);
		}
	});

	it('rejects component fixture substitution and row swaps after all broad hashes are recomputed', () => {
		const rehash = (value: Crosswalk, path: string, changed: string) => {
			const sourceSha256 = createHash('sha256').update(changed).digest('hex');
			for (const entry of value.cases)
				for (const evidence of entry.adapted)
					if (evidence.file === path) {
						evidence.sourceSha256 = sourceSha256;
						entry.identityEvidence.ownershipSha256 = createHash('sha256')
							.update(
								[
									entry.upstreamId,
									evidence.id,
									evidence.file,
									evidence.fullName,
									sourceSha256,
								].join('\0'),
							)
							.digest('hex');
					}
		};
		for (const [upstreamId, transform] of [
			[
				'test.jsx:578:should support `components` (headings)',
				(source: string) =>
					source.replace(
						"['headings', '# a\\n## b', ['h1', 'h2'], undefined, 2]",
						"['headings', '# changed\\n## b', ['h1', 'h2'], undefined, 2]",
					),
			],
			[
				'test.jsx:578:should support `components` (headings)',
				(source: string) =>
					source.replace(
						"\t\t['headings', '# a\\n## b', ['h1', 'h2'], undefined, 2],\n\t\t['code', '```\\na\\n```\\n\\n\\tb\\n\\n`c`', ['code'], undefined, 3],",
						"\t\t['code', '```\\na\\n```\\n\\n\\tb\\n\\n`c`', ['code'], undefined, 3],\n\t\t['headings', '# a\\n## b', ['h1', 'h2'], undefined, 2],",
					),
			],
		] as const) {
			const mutated = structuredClone(crosswalk);
			const target = mutated.cases.find((entry) => entry.upstreamId === upstreamId)!;
			const path = target.adapted[0].file;
			const original = readFileSync(join(repoRoot, path), 'utf8');
			const changed = transform(original);
			expect(changed).not.toBe(original);
			rehash(mutated, path, changed);
			expect(() =>
				validate(mutated, (file) =>
					file === path ? Buffer.from(changed) : readFileSync(join(repoRoot, file)),
				),
			).toThrow(
				/parameter row drifted|parameter row ownership index drifted|parameter row does not produce adapted runtime identity/,
			);
		}
	});

	it('rejects a swapped component row when the actual crosswalk generator regenerates evidence', () => {
		const target = crosswalk.cases.find(
			(entry) => entry.upstreamId === 'test.jsx:578:should support `components` (headings)',
		)!;
		const path = target.adapted[0].file;
		const original = readFileSync(join(repoRoot, path), 'utf8');
		const changed = original.replace(
			"\t\t['headings', '# a\\n## b', ['h1', 'h2'], undefined, 2],\n\t\t['code', '```\\na\\n```\\n\\n\\tb\\n\\n`c`', ['code'], undefined, 3],",
			"\t\t['code', '```\\na\\n```\\n\\n\\tb\\n\\n`c`', ['code'], undefined, 3],\n\t\t['headings', '# a\\n## b', ['h1', 'h2'], undefined, 2],",
		);
		expect(changed).not.toBe(original);
		const result = regenerateCrosswalkWithSource(path, changed);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toMatch(/independently pinned fixture/);
	});

	it('rejects a synthetic component fixture with its title preserved during regeneration', () => {
		const target = crosswalk.cases.find(
			(entry) => entry.upstreamId === 'test.jsx:578:should support `components` (headings)',
		)!;
		const path = target.adapted[0].file;
		const original = readFileSync(join(repoRoot, path), 'utf8');
		const changed = original.replace(
			"['headings', '# a\\n## b', ['h1', 'h2'], undefined, 2]",
			"['headings', '```\\na\\n```', ['code'], undefined, 1]",
		);
		expect(changed).not.toBe(original);
		const result = regenerateCrosswalkWithSource(path, changed);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toMatch(/independently pinned fixture/);
	});

	it('rejects an unpinned synthetic parameter row during regeneration', () => {
		const target = crosswalk.cases.find(
			(entry) => entry.upstreamId === 'test.jsx:578:should support `components` (headings)',
		)!;
		const path = target.adapted[0].file;
		const original = readFileSync(join(repoRoot, path), 'utf8');
		const changed = original.replace(
			"['headings', '# a\\n## b', ['h1', 'h2'], undefined, 2]",
			"['headings', '```\\na\\n```', ['code'], undefined, 1]",
		);
		expect(changed).not.toBe(original);
		const incompleteMap = structuredClone(parameterRows);
		delete incompleteMap[target.adapted[0].id];
		const result = regenerateCrosswalkWithSource(path, changed, incompleteMap);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toMatch(/Parameter-row map has 53 entries, expected 54/);
	});
});
