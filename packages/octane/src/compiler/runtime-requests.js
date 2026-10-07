import { initSync as initModuleLexer, parse as lexModule } from 'es-module-lexer';

let moduleLexerInitialized = false;

function lexModuleImports(source, id) {
	if (!moduleLexerInitialized) {
		initModuleLexer();
		moduleLexerInitialized = true;
	}
	try {
		return lexModule(source, id)[0];
	} catch {
		return null;
	}
}

/**
 * A JavaScript module's static import and re-export requests in source order,
 * or null when the module lexer rejects it (JSX, for one). The lexer reads only
 * module syntax in linear time, so a request spelled inside a string, template,
 * comment, or regular expression never counts.
 */
export function lexStaticImportRequests(source, id) {
	const imports = lexModuleImports(source, id);
	if (imports === null) return null;
	const requests = new Set();
	for (const request of imports) {
		// -1 marks a static import or re-export of any phase.
		if (request.d === -1 && request.n !== undefined) requests.add(request.n);
	}
	return [...requests];
}

/** Target bare Octane ESM requests at the explicit server runtime. */
export function rewriteServerRuntimeRequests(source, id) {
	if (!source.includes('octane')) return null;
	const imports = lexModuleImports(source, id);
	if (imports === null) return null;

	let code = source;
	let changed = false;
	for (let index = imports.length - 1; index >= 0; index--) {
		const request = imports[index];
		const target =
			request.n === 'octane'
				? 'octane/server'
				: request.n === 'octane/signals/client'
					? 'octane/signals/server'
					: request.n === 'octane/react'
						? 'octane/react/server'
						: null;
		if (target === null) continue;
		if (request.d === -1) {
			code = code.slice(0, request.s) + target + code.slice(request.e);
			changed = true;
			continue;
		}
		const quote = source[request.s];
		if (quote !== "'" && quote !== '"' && quote !== '`') continue;
		code = code.slice(0, request.s) + `${quote}${target}${quote}` + code.slice(request.e);
		changed = true;
	}
	return changed ? { code, map: null } : null;
}
