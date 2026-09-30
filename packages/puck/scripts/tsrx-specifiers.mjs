import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// The port renames upstream `.tsx` modules to `.tsrx`, but upstream imports
// them without an extension. TypeScript never tries `.tsrx` when it resolves an
// extensionless specifier, so `tsrx-tsc` reports every such import as missing
// and every name re-exported through one as absent. Spell the `.tsrx` path out,
// as the rest of the repository does.

const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}(?:\/[^'"]*)?)\2/g;
const RESOLVED_BY_TYPESCRIPT = ['.ts', '.tsx', '.d.ts', '.js', '.jsx'];

function isFile(path) {
	return existsSync(path) && statSync(path).isFile();
}

function tsrxSpecifier(fromDirectory, specifier) {
	if (/\.[cm]?[jt]sx?$|\.tsrx$|\.css$|\.json$/.test(specifier)) return null;
	const target = resolve(fromDirectory, specifier);
	if (RESOLVED_BY_TYPESCRIPT.some((extension) => isFile(target + extension))) return null;
	if (isFile(`${target}.tsrx`)) return `${specifier}.tsrx`;
	if (RESOLVED_BY_TYPESCRIPT.some((extension) => isFile(join(target, `index${extension}`)))) {
		return null;
	}
	if (isFile(join(target, 'index.tsrx'))) return `${specifier.replace(/\/$/, '')}/index.tsrx`;
	return null;
}

export function rewriteTsrxSpecifiers(text, file) {
	const fromDirectory = dirname(file);
	return text.replace(SPECIFIER, (match, prefix, quote, specifier) => {
		const rewritten = tsrxSpecifier(fromDirectory, specifier);
		return rewritten ? `${prefix}${quote}${rewritten}${quote}` : match;
	});
}

export function addTsrxSpecifiers(root) {
	for (const name of readdirSync(root)) {
		const path = join(root, name);
		if (statSync(path).isDirectory()) {
			addTsrxSpecifiers(path);
		} else if (/\.(?:ts|tsrx)$/.test(name)) {
			const text = readFileSync(path, 'utf8');
			const rewritten = rewriteTsrxSpecifiers(text, path);
			if (rewritten !== text) writeFileSync(path, rewritten);
		}
	}
}
