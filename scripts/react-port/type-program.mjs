import { createRequire } from 'node:module';
import ts from 'typescript';
import { compileTypesInspection } from '../../packages/octane/src/compiler/volar.js';

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
