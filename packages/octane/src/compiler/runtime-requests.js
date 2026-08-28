import { initSync as initModuleLexer, parse as lexModule } from 'es-module-lexer';

let moduleLexerInitialized = false;

/** Target bare Octane ESM requests at the explicit server runtime. */
export function rewriteServerRuntimeRequests(source, id) {
	if (!source.includes('octane')) return null;
	if (!moduleLexerInitialized) {
		initModuleLexer();
		moduleLexerInitialized = true;
	}

	let imports;
	try {
		[imports] = lexModule(source, id);
	} catch {
		return null;
	}

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
