import type { CompileDiagnostic } from 'octane/compiler';
import type { Compiler, Finding } from './types.js';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * The Octane compiler that judges the migrated code: the project's own when it
 * has one, so the result matches what its build will do, else the copy this
 * package ships with, since a React project has no Octane installed yet.
 */
export async function loadCompiler(root: string): Promise<Compiler> {
	for (const base of [path.join(root, 'noop.js'), import.meta.url]) {
		let entry: string;
		try {
			entry = createRequire(base).resolve('octane/compiler');
		} catch {
			continue;
		}
		const module: Partial<Pick<Compiler, 'collectDiagnostics'>> = await import(
			pathToFileURL(entry).href
		);
		if (typeof module.collectDiagnostics === 'function') {
			return { collectDiagnostics: module.collectDiagnostics, from: entry };
		}
	}
	throw new Error('Could not load `octane/compiler`.');
}

export function finding(diagnostic: CompileDiagnostic): Finding {
	return {
		code: diagnostic.code,
		severity: diagnostic.severity,
		message: String(diagnostic.message).replace(`[${diagnostic.code}] `, ''),
		line: diagnostic.start?.line ?? 1,
	};
}

/** A compiler exception, including parser failures with a source location. */
export function thrown(error: unknown): Finding {
	const object = typeof error === 'object' && error !== null ? error : null;
	const location = object && 'loc' in object ? object.loc : null;
	return {
		code: 'COMPILE_ERROR',
		severity: 'error',
		message: String(object && 'message' in object ? (object.message ?? error) : error),
		line:
			location &&
			typeof location === 'object' &&
			'line' in location &&
			typeof location.line === 'number'
				? location.line
				: 1,
	};
}
