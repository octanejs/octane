#!/usr/bin/env node
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEST = join(__dirname, '../src');
const upstreamRoot = process.argv[2];

if (!upstreamRoot || !existsSync(join(upstreamRoot, 'src/index.ts'))) {
	console.error('Usage: node port-upstream.mjs <path-to-xyflow/packages/react>');
	process.exit(1);
}

const SRC = join(upstreamRoot, 'src');

function walk(dir) {
	const out = [];
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) out.push(...walk(full));
		else out.push(full);
	}
	return out;
}

function shimImportPath(fromFile) {
	const destRel = relative(join(DEST, dirname(fromFile)), join(DEST, 'react-shim.ts')).replace(
		/\\/g,
		'/',
	);
	return destRel.startsWith('.') ? destRel : `./${destRel}`;
}

function transformSource(text, destRel) {
	let out = text.replace(/\r\n/g, '\n');
	const shimPath = shimImportPath(destRel).replace(/\.ts$/, '.js');

	out = out.replace(/from 'react-dom'/g, "from 'octane/client'");
	out = out.replace(/from "react-dom"/g, 'from "octane/client"');
	out = out.replace(
		/import type \{([^}]+)\} from 'react';/g,
		`import type {$1} from '${shimPath}';`,
	);
	out = out.replace(
		/import type \{([^}]+)\} from "react";/g,
		`import type {$1} from "${shimPath}";`,
	);
	out = out.replace(/import \{([^}]+)\} from 'react';/g, (match, imports) => {
		const typeOnly =
			!imports.includes(' type ') &&
			imports.split(',').every((part) => part.trim().startsWith('type '));
		if (typeOnly) return `import {${imports}} from '${shimPath}';`;
		return `import {${imports}} from 'octane';`;
	});
	out = out.replace(/from 'react'/g, "from 'octane'");
	out = out.replace(/from "react"/g, 'from "octane"');
	out = out.replace(/from 'zustand\/traditional'/g, "from '@octanejs/zustand/traditional'");
	out = out.replace(/from "zustand\/traditional"/g, 'from "@octanejs/zustand/traditional"');
	out = out.replace(/\bReactNode\b/g, 'OctaneNode');
	out = out.replace(/\bJSX\.Element\b/g, 'Octane.JSX.Element');
	out = out.replace(/\bMutableRefObject\b/g, 'RefObject');
	out = out.replace(/React\.memo\b/g, 'memo');
	out = out.replace(/React\.FC\b/g, 'FC');
	out = out.replace(/React\.CSSProperties\b/g, 'CSSProperties');

	if (basename(destRel) === 'general.ts' && out.includes('fixedForwardRef')) {
		out = out.replace(
			/import[\s\S]*?from 'octane';/,
			"import type { Octane } from 'octane/jsx-runtime';",
		);
		out = out.replace(
			/export function fixedForwardRef[\s\S]*?\n\}/,
			`export function fixedForwardRef<T, P extends Record<string, unknown> = Record<string, unknown>>(
  render: (props: P & { ref?: Octane.Ref<T> }) => Octane.JSX.Element,
): (props: P & { ref?: Octane.Ref<T> }) => Octane.JSX.Element {
  return render;
}`,
		);
	}

	return out;
}

rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST, { recursive: true });

for (const file of walk(SRC)) {
	const rel = relative(SRC, file);
	let destRel = rel;
	if (destRel.endsWith('.tsx')) destRel = destRel.replace(/\.tsx$/, '.tsrx');
	const dest = join(DEST, destRel);
	mkdirSync(dirname(dest), { recursive: true });
	if (file.endsWith('.ts') || file.endsWith('.tsx')) {
		writeFileSync(dest, transformSource(readFileSync(file, 'utf8'), destRel));
	} else {
		cpSync(file, dest);
	}
}

console.log(`Ported into ${DEST}`);
