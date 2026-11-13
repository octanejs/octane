// `octane/data/manifest` resolves to this file, and this loader replaces it
// with the manifest generated from the project's `*.data.ts` modules.
import { createDataProgram } from 'octane/compiler/bundler';

/** One program per root, so unchanged contract modules are not reparsed. */
const programs = new Map();

export default function dataManifestLoader() {
	const { root } = this.getOptions();
	let program = programs.get(root);
	if (program === undefined) {
		program = createDataProgram(root);
		programs.set(root, program);
	}
	// Adding or removing a contract module anywhere under the root rebuilds it.
	program.invalidate();
	this.addContextDependency(root);
	const { code, files } = program.manifest();
	for (const file of files) this.addDependency(file);
	return code;
}
