/**
 * Execute the named exports of compiler output against explicit runtime modules.
 *
 * This keeps compile-and-run tests at the public module boundary without writing
 * generated files into the workspace. The compiler currently emits named imports
 * and named declarations for the fixtures that use this harness; fail loudly if a
 * fixture grows beyond that deliberately small module subset.
 */
export function evaluateCompiledModule(
	code: string,
	modules: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): Record<string, any> {
	const exports: string[] = [];
	const imports: string[] = [];
	let runnable = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/g,
		(_match, bindings: string, specifier: string) => {
			if (!(specifier in modules)) {
				throw new Error(`No runtime module supplied for ${JSON.stringify(specifier)}.`);
			}
			imports.push(
				`const {${bindings.replace(/\s+as\s+/g, ': ')}} = __modules[${JSON.stringify(specifier)}];`,
			);
			return '';
		},
	);
	runnable = runnable.replace(
		/export\s+(const|let|var|function)\s+([$A-Z_a-z][$\w]*)/g,
		(_match, declaration: string, name: string) => {
			exports.push(name);
			return `${declaration} ${name}`;
		},
	);
	if (/\b(?:import|export)\s/.test(runnable)) {
		throw new Error('Compiled-module fixture emitted an unsupported module declaration.');
	}
	const publish = exports.map((name) => `__exports.${name} = ${name};`).join('\n');
	return new Function(
		'__modules',
		'__exports',
		`${imports.join('\n')}\n${runnable}\n${publish}\nreturn __exports;`,
	)(modules, {});
}
