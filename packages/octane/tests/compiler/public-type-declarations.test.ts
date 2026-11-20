// @vitest-environment node

// A library built on Octane ships the declarations TypeScript emits for its
// exports, and an inferred host prop or React-shaped alias is written into them
// by the module that declares it. `react` resolves from Octane, which depends on
// `@types/react`, but not necessarily from the library or the app using it: such
// an app gets "Cannot find module 'react'" with skipLibCheck off, and the prop
// silently becomes `any` with it on.
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
// Virtual, so `react` resolves only from Octane's own files.
const ROOT = '/__octane_declaration_consumer__';
const OPTIONS: ts.CompilerOptions = {
	target: ts.ScriptTarget.ES2022,
	module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	strict: true,
	types: [],
	paths: {
		octane: [`${SRC}index.ts`],
		'octane/jsx-runtime': [`${SRC}jsx-runtime.d.ts`],
	},
};

// Host props typed by Octane's React-shaped unions: [tag, prop, a valid value].
const HOST_PROPS = [
	['div', 'role', 'tab'],
	['svg', 'role', 'img'],
	['a', 'target', '_blank'],
	['a', 'referrerPolicy', 'no-referrer'],
	['a', 'referrerpolicy', 'origin'],
	['area', 'referrerPolicy', 'origin'],
	['iframe', 'referrerPolicy', 'origin'],
	['img', 'referrerPolicy', 'origin'],
	['link', 'referrerPolicy', 'origin'],
	['script', 'referrerPolicy', 'origin'],
] as const;
const ALIASES = ['role', 'target', 'referrerPolicy', 'type', 'inputType'];

// Parts whose props TypeScript infers, so declaration emit spells out each prop,
// like an adapter's generic roots. `<input>` is checked by its `type` alone.
const LIBRARY = `
import type {
	AriaRole,
	ComponentProps,
	HTMLAttributeAnchorTarget,
	HTMLAttributeReferrerPolicy,
	HTMLInputTypeAttribute,
	JSX,
} from 'octane';

declare function part<Tag extends keyof JSX.IntrinsicElements>(
	tag: Tag,
): (props: { [K in keyof ComponentProps<Tag>]: ComponentProps<Tag>[K] }) => void;
export const parts = {
${[...new Set(HOST_PROPS.map(([tag]) => tag))].map((tag) => `\t${tag}: part('${tag}'),`).join('\n')}
};

declare const aliases: {
	role: AriaRole;
	target: HTMLAttributeAnchorTarget;
	referrerPolicy: HTMLAttributeReferrerPolicy;
	type: HTMLInputTypeAttribute;
	inputType: ComponentProps<'input'>['type'];
};
export const { ${ALIASES.join(', ')} } = aliases;
`;

// A type TypeScript cannot resolve accepts anything, so each one must reject a number.
const APP = [
	`import { parts, ${ALIASES.join(', ')} } from './lib.js';`,
	...HOST_PROPS.flatMap(([tag, prop, value]) => [
		`parts.${tag}({ ${prop}: '${value}' });`,
		'// @ts-expect-error',
		`parts.${tag}({ ${prop}: 1 });`,
	]),
	`export const strings: (string | undefined)[] = [${ALIASES.join(', ')}];`,
	...ALIASES.flatMap((name) => [
		'// @ts-expect-error',
		`export const ${name}Number: number = ${name};`,
	]),
].join('\n');

function createProgram(files: Map<string, string>, options: ts.CompilerOptions) {
	const host = ts.createCompilerHost(options);
	const { readFile, fileExists, directoryExists, getSourceFile } = host;
	host.readFile = (path) => files.get(path) ?? readFile(path);
	host.fileExists = (path) => files.has(path) || fileExists(path);
	host.directoryExists = (path) => path === ROOT || directoryExists?.(path) === true;
	host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) => {
		const text = files.get(path);
		return text === undefined
			? getSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile)
			: ts.createSourceFile(path, text, languageVersion, true);
	};
	return ts.createProgram({ rootNames: [...files.keys()], options, host });
}

function messages(diagnostics: readonly ts.Diagnostic[]) {
	return diagnostics.map(
		(diagnostic) =>
			`${diagnostic.file?.fileName.slice(ROOT.length + 1)}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
	);
}

function emitLibraryDeclarations() {
	const file = `${ROOT}/lib.ts`;
	const program = createProgram(new Map([[file, LIBRARY]]), {
		...OPTIONS,
		declaration: true,
		emitDeclarationOnly: true,
		skipLibCheck: true,
	});
	const source = program.getSourceFile(file)!;
	let declarations = '';
	const result = program.emit(source, (_name, text) => (declarations += text), undefined, true);
	expect(messages([...program.getSemanticDiagnostics(source), ...result.diagnostics])).toEqual([]);
	return declarations;
}

/** Every module an `import("…")` type in the declarations names. */
function importedModules(declarations: string) {
	const modules = new Set<string>();
	const visit = (node: ts.Node) => {
		if (
			ts.isImportTypeNode(node) &&
			ts.isLiteralTypeNode(node.argument) &&
			ts.isStringLiteral(node.argument.literal)
		)
			modules.add(node.argument.literal.text);
		ts.forEachChild(node, visit);
	};
	visit(ts.createSourceFile('lib.d.ts', declarations, ts.ScriptTarget.ES2022, true));
	return [...modules].sort();
}

function appDiagnostics(declarations: string, skipLibCheck: boolean) {
	const files = new Map([
		[`${ROOT}/lib.d.ts`, declarations],
		[`${ROOT}/app.ts`, APP],
	]);
	const program = createProgram(files, { ...OPTIONS, noEmit: true, skipLibCheck });
	return messages(
		[...files.keys()].flatMap((file) => {
			const source = program.getSourceFile(file)!;
			return [
				...program.getSyntacticDiagnostics(source),
				...program.getSemanticDiagnostics(source),
			];
		}),
	);
}

describe('declarations emitted by a library built on Octane', () => {
	let declarations: string;
	beforeAll(() => {
		declarations = emitLibraryDeclarations();
	}, 30_000);

	it('name inferred host prop and React-shaped alias types through octane', () => {
		expect(importedModules(declarations)).toEqual(['octane']);
	});

	it.each([false, true])(
		'typecheck in an app that cannot resolve react, with skipLibCheck %s',
		(skipLibCheck) => {
			expect(appDiagnostics(declarations, skipLibCheck)).toEqual([]);
		},
		30_000,
	);
});
