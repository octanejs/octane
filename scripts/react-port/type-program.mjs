import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { importNativeTypeScript, TSRX_CONTENT_MAPPER } from '../octane-tsc/native.mjs';

const { API } = await importNativeTypeScript('unstable/sync');

let wrapperCount = 0;

/**
 * A type-evidence program on the repository's TypeScript 7 (`typescript-native`)
 * through its `typescript/unstable/sync` API. `.tsrx` reaches the checker through
 * @tsrx/content-mapper and Octane's Volar compiler, as in octane-tsc; a plain
 * program would silently type imported TSRX as `any`. The mapper resolves from
 * the project's directory, so a project with `.tsrx` must sit inside the
 * repository. A project without `.tsrx`, such as a fixture outside it, passes
 * `{ tsrx: false }`.
 *
 * `project` is the tsconfig whose compiler options apply; `rootNames` replace its
 * files. Nodes, symbols and types come from TypeScript 7: inspect them through
 * `./native-types.mjs`, never the classic `typescript` helpers, whose
 * `SyntaxKind` numbering differs. The program owns a TypeScript process, so call
 * `close()` when done.
 *
 * @param {readonly string[]} rootNames
 * @param {string} project
 * @param {{ tsrx?: boolean }} [options]
 */
export function createTypeEvidenceProgram(rootNames, project, { tsrx = true } = {}) {
	// A sibling wrapper, as in octane-tsc: `contentMappers` is an error without
	// `runExternalCode`, so the project's own tsconfig cannot declare it.
	const wrapper = path.join(
		path.dirname(project),
		`.type-evidence-${process.pid}-${wrapperCount++}.${path.basename(project)}`,
	);
	writeFileSync(
		wrapper,
		JSON.stringify({
			extends: `./${path.basename(project)}`,
			files: rootNames.map((file) => path.resolve(file)),
			include: [],
			...(tsrx ? { contentMappers: [TSRX_CONTENT_MAPPER] } : {}),
		}),
	);
	const api = new API({ cwd: path.dirname(project), runExternalCode: tsrx });
	try {
		const configured = api
			.createSnapshot({ openProjects: [wrapper] })
			.getConfiguredProject(wrapper);
		if (!configured) throw new Error(`TypeScript did not open ${project}`);
		const { program, checker } = configured;
		// An unresolvable content mapper (TS100031) is reported here.
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
