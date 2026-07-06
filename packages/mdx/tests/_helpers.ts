/**
 * Shared test rig helpers for @octanejs/mdx.
 *
 * `evalModuleCode` evaluates compiled module code (client or server codegen)
 * with every import rewritten to a binding from `mods` (specifier → module
 * namespace) — the same eval trick as
 * packages/octane/tests/hydration/hydration.test.ts, generalized so a
 * document's own imports (an embedded `.tsrx` component, the provider layer)
 * can be injected too.
 */
export function evalModuleCode(
	code: string,
	mods: Record<string, Record<string, any>>,
	// `import.meta.hot` shim — `import.meta` is illegal outside a real module,
	// so HMR-enabled client output rewrites it to this injected value (pass a
	// `{ accept }` stub to capture the registration, or leave undefined).
	hot?: { accept(cb: (module: any) => void): void },
): Record<string, any> {
	let defaultName: string | null = null;
	code = code.replace(/import\.meta\.hot/g, '__hot');
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/g,
		(_m: string, names: string, spec: string) =>
			`const {${names.replace(/ as /g, ': ')}} = __mods[${JSON.stringify(spec)}];`,
	);
	code = code.replace(
		/import\s+(\w+)\s+from\s*['"]([^'"]+)['"];?/g,
		(_m: string, name: string, spec: string) =>
			`const ${name} = __mods[${JSON.stringify(spec)}].default;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export default function (\w+)/, (_m: string, name: string) => {
		defaultName = name;
		return `function ${name}`;
	});
	code = code.replace(/export default (\w+);/, (_m: string, name: string) => {
		defaultName = name;
		return '';
	});
	if (defaultName) code += `\n__exports.default = ${defaultName};`;
	const fn = new Function('__mods', '__exports', '__hot', code + '\nreturn __exports;');
	return fn(mods, {}, hot);
}

/** Hydration block/item markers aside, the payload is plain HTML. */
export function stripMarkers(html: string): string {
	return html.replace(/<!--[^>]*-->/g, '');
}
