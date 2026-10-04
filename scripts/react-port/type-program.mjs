import { rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { compileTypesInspection } from '../../packages/octane/src/compiler/volar.js';
import {
	compatibilityOptions,
	importNativeTypeScript,
	TSRX_CONTENT_MAPPER,
} from '../octane-tsc/native.mjs';

const { API } = await importNativeTypeScript('unstable/sync');

const require = createRequire(import.meta.url);
const pluginRequire = createRequire(require.resolve('@tsrx/typescript-plugin/package.json'));
const { proxyCreateProgram } = pluginRequire('@volar/typescript/lib/node/proxyCreateProgram.js');

export function createTypeEvidenceProgram(rootNames, options) {
	// Use the compiler's public type transform and Volar's module resolver, just
	// as tsrx-tsc does. A plain TS program silently turns imported TSRX into any.
	const createProgram = proxyCreateProgram(ts, ts.createProgram, () => [
		{
			getLanguageId(fileName) {
				return fileName.endsWith('.tsrx') ? 'tsrx' : undefined;
			},
			createVirtualCode(fileName, languageId, snapshot) {
				if (languageId !== 'tsrx') return;
				const { code } = compileTypesInspection(
					snapshot.getText(0, snapshot.getLength()),
					fileName,
				);
				return {
					id: 'typescript',
					languageId: 'typescriptreact',
					snapshot: ts.ScriptSnapshot.fromString(code),
					mappings: [],
				};
			},
			typescript: {
				extraFileExtensions: [
					{ extension: 'tsrx', isMixedContent: true, scriptKind: ts.ScriptKind.Deferred },
				],
				getServiceScript(code) {
					return {
						code,
						extension: '.tsx',
						scriptKind: ts.ScriptKind.TSX,
						preventLeadingOffset: true,
					};
				},
			},
		},
	]);
	return createProgram({
		rootNames,
		options: { ...options },
		host: ts.createCompilerHost(options, true),
	});
}

let nativeWrapperCount = 0;

/**
 * The same evidence program on the repository's TypeScript 7 (`typescript-native`)
 * through its `typescript/unstable/sync` API. `.tsrx` reaches the checker through
 * @tsrx/content-mapper and Octane's Volar compiler, as in octane-tsc, so the
 * project must sit inside the repository, where both resolve.
 *
 * `project` is the tsconfig whose compiler options apply; `rootNames` replace its
 * files. Nodes and types come from TypeScript 7: inspect them with
 * `typescript/unstable/ast`, never the classic `typescript` helpers, whose
 * `SyntaxKind` numbering differs. The program owns a TypeScript process, so call
 * `close()` when done.
 *
 * @param {readonly string[]} rootNames
 * @param {string} project
 */
export function createNativeTypeEvidenceProgram(rootNames, project) {
	// A sibling wrapper, as in octane-tsc: `contentMappers` is an error without
	// `runExternalCode`, so the project's own tsconfig cannot declare it.
	const wrapper = path.join(
		path.dirname(project),
		`.type-evidence-${process.pid}-${nativeWrapperCount++}.${path.basename(project)}`,
	);
	writeFileSync(
		wrapper,
		JSON.stringify({
			extends: `./${path.basename(project)}`,
			compilerOptions: compatibilityOptions(project),
			files: rootNames.map((file) => path.resolve(file)),
			include: [],
			contentMappers: [TSRX_CONTENT_MAPPER],
		}),
	);
	const api = new API({ cwd: path.dirname(project), runExternalCode: true });
	try {
		const configured = api
			.createSnapshot({ openProjects: [wrapper] })
			.getConfiguredProject(wrapper);
		if (!configured) throw new Error(`TypeScript did not open ${project}`);
		const { program, checker } = configured;
		const configErrors = program.getConfigFileParsingDiagnostics();
		if (configErrors.length > 0) {
			throw new Error(`${project}: ${configErrors.map((error) => error.text).join('\n')}`);
		}
		return { program, checker, close: () => api.close() };
	} catch (error) {
		api.close();
		throw error;
	} finally {
		rmSync(wrapper, { force: true });
	}
}
