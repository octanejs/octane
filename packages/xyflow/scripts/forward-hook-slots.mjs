#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOKS = join(fileURLToPath(new URL('.', import.meta.url)), '../src/hooks');

function walk(dir) {
	const out = [];
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) out.push(...walk(full));
		else if (full.endsWith('.ts') && !full.endsWith('slot.ts')) out.push(full);
	}
	return out;
}

function patchHookFile(path) {
	let source = readFileSync(path, 'utf8');
	if (source.includes('resolveHookSlot')) return false;

	const usesStore = /\buseStore(?:Api)?\(/.test(source) || /\buseReactFlow\(/.test(source);
	if (!usesStore) return false;

	if (!source.includes("from './slot'") && !source.includes('from "./slot"')) {
		const firstImport = source.indexOf('import ');
		const end = source.indexOf('\n', firstImport);
		source = `${source.slice(0, end + 1)}import { resolveHookSlot } from './slot';\n${source.slice(end + 1)}`;
	}

	source = source.replace(
		/export function (\w+)(<[^>]*>)?\(([^)]*)\)(\s*:\s*[^{]+)?\{/g,
		function replaceExport(match, name, generics, params, ret) {
			if (params.includes('...rest') || params.includes('_slot')) return match;
			const nextParams =
				params.trim().length > 0
					? `${params}, ...rest: [slot?: symbol]`
					: '...rest: [slot?: symbol]';
			return `export function ${name}${generics ?? ''}(${nextParams})${ret ?? ''} {\n  const slot = resolveHookSlot(rest);`;
		},
	);

	source = source.replace(/\buseStoreApi\(\)/g, 'useStoreApi(slot)');
	source = source.replace(/\buseReactFlow\(\)/g, 'useReactFlow(slot)');
	source = source.replace(/\buseReactFlow<([^>]+)>\(\)/g, 'useReactFlow<$1>(slot)');

	source = source.replace(/\buseStore\(([\s\S]*?)\);/g, function replaceUseStore(_match, args) {
		const trimmed = args.trim();
		if (trimmed.endsWith('slot')) return _match;
		return `useStore(${trimmed}, slot);`;
	});

	writeFileSync(path, source);
	return true;
}

let count = 0;
for (const file of walk(HOOKS)) {
	if (patchHookFile(file)) {
		count++;
		console.log('patched', file);
	}
}
console.log(`patched ${count} hook files`);
