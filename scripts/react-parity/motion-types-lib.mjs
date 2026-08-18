import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

export const ASSERTIONS_DOC = 'packages/motion/typetests/assertions.md';
export const PRISTINE_TYPES = 'packages/motion/typetests/pristine/types.test-d.ts';
export const ADAPTED_TYPES = 'packages/motion/typetests/adapted/types.test-d.ts';
export const PRISTINE_TSCONFIG = 'packages/motion/typetests/pristine/tsconfig.json';
export const ADAPTED_TSCONFIG = 'packages/motion/typetests/adapted/tsconfig.json';

const sha256 = function hash(value) {
	return createHash('sha256').update(value).digest('hex');
};

function normalizeComment(comment) {
	return comment
		.replace(/^\/\*\*|\*\/$/g, '')
		.replace(/^\s*\*\s?/gm, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function assertionGroups(source) {
	const groups = [];
	for (const match of source.matchAll(/\/\/\s*(\d+)\.\s+([^\n]+)/g)) {
		groups.push(`group:${match[1]}:${match[2].trim()}`);
	}
	for (const match of source.matchAll(/\/\/\s*@ts-expect-error([^\n]*)\n\s*([^\n]+)/g)) {
		groups.push(`expect-error:${match[1].trim()}:${match[2].replace(/\s+/g, ' ').trim()}`);
	}
	for (const match of source.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
		groups.push(`doc:${normalizeComment(match[0])}`);
	}
	return groups;
}

function structuralSource(source) {
	const sourceFile = ts.createSourceFile(
		'types.test-d.ts',
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const replacements = [];
	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
			continue;
		const specifier = statement.moduleSpecifier.text;
		if (specifier !== 'motion/react' && specifier !== '@octanejs/motion') continue;
		replacements.push({
			start: statement.moduleSpecifier.getStart(sourceFile) + 1,
			end: statement.moduleSpecifier.getEnd() - 1,
			value: '#motion-public-surface',
		});
	}
	let transformed = source;
	for (const replacement of replacements.sort(function byStartDesc(a, b) {
		return b.start - a.start;
	})) {
		transformed =
			transformed.slice(0, replacement.start) +
			replacement.value +
			transformed.slice(replacement.end);
	}
	return transformed.replace(/\s+/g, ' ').trim();
}

function readRequired(root, relativePath) {
	const absolute = resolve(root, relativePath);
	if (!existsSync(absolute)) throw new Error(`missing ${relativePath}`);
	return readFileSync(absolute, 'utf8');
}

function compilerOwnsFile(root, tsconfigPath, relativeFile) {
	const absoluteConfig = resolve(root, tsconfigPath);
	const configFile = ts.readConfigFile(absoluteConfig, ts.sys.readFile);
	if (configFile.error) {
		throw new Error(
			`failed to read ${tsconfigPath}: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n')}`,
		);
	}
	const parsed = ts.parseJsonConfigFileContent(
		configFile.config,
		ts.sys,
		resolve(root, tsconfigPath, '..'),
	);
	const absoluteFile = resolve(root, relativeFile);
	return parsed.fileNames.some(function matches(fileName) {
		return resolve(fileName) === absoluteFile;
	});
}

export function verifyMotionTypes(root) {
	const assertionsDoc = readRequired(root, ASSERTIONS_DOC);
	const pristine = readRequired(root, PRISTINE_TYPES);
	const adapted = readRequired(root, ADAPTED_TYPES);
	const pristineGroups = assertionGroups(pristine);
	const adaptedGroups = assertionGroups(adapted);
	if (pristineGroups.length === 0) throw new Error('pristine type file has no assertion groups');
	if (JSON.stringify(pristineGroups) !== JSON.stringify(adaptedGroups)) {
		throw new Error('motion pristine/adapted type assertion groups must match one-for-one');
	}
	if (!assertionsDoc.includes('import root `motion/react` → `@octanejs/motion`')) {
		throw new Error('assertions.md must document the permitted import-root transformation');
	}
	for (const required of [
		'`motion.div` host factory is accepted',
		'Rejected assertion: number is not a string',
		'Rejected assertion: string is not a number',
	]) {
		if (!assertionsDoc.includes(required)) {
			throw new Error(`assertions.md missing required assertion group: ${required}`);
		}
	}
	if (structuralSource(pristine) !== structuralSource(adapted)) {
		throw new Error(
			'motion pristine/adapted type sources diverge beyond the permitted import-root transformation',
		);
	}
	if (!compilerOwnsFile(root, PRISTINE_TSCONFIG, PRISTINE_TYPES)) {
		throw new Error('pristine tsconfig must include types.test-d.ts');
	}
	if (!compilerOwnsFile(root, ADAPTED_TSCONFIG, ADAPTED_TYPES)) {
		throw new Error('adapted tsconfig must include types.test-d.ts');
	}
	return {
		assertionGroups: pristineGroups.length,
		pristineSha256: sha256(pristine),
		adaptedSha256: sha256(adapted),
		assertionsSha256: sha256(assertionsDoc),
	};
}
