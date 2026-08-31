#!/usr/bin/env node
/**
 * Mechanical port skeleton for @blocknote/react → @octanejs/blocknote.
 *
 * Usage:
 *   node scripts/port-upstream.mjs <path-to-@blocknote/react>
 *
 * Example:
 *   node scripts/port-upstream.mjs node_modules/@blocknote/react
 *
 * Files listed in CHECKPOINT_FILES are copied with transforms but flagged for
 * manual review at the TipTap / react-dom integration boundary.
 */
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

/** TipTap / react-dom / node-view boundary — needs human review after mechanical pass. */
const CHECKPOINT_FILES = new Set([
	'editor/EditorContent.tsx',
	'schema/@util/ReactRenderUtil.ts',
	'schema/ReactBlockSpec.tsx',
	'schema/ReactInlineContentSpec.tsx',
	'schema/ReactStyleSpec.tsx',
	'schema/useNodeViewBlock.ts',
	'components/Comments/EmojiMartPicker.tsx',
]);

if (!upstreamRoot || !existsSync(join(upstreamRoot, 'src/index.ts'))) {
	console.error('Usage: node scripts/port-upstream.mjs <path-to-@blocknote/react>');
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

	out = out.replace(/from '@tiptap\/react'/g, "from '@octanejs/tiptap'");
	out = out.replace(/from "@tiptap\/react"/g, 'from "@octanejs/tiptap"');
	out = out.replace(/from '@floating-ui\/react'/g, "from '@octanejs/floating-ui'");
	out = out.replace(/from "@floating-ui\/react"/g, 'from "@octanejs/floating-ui"');
	out = out.replace(/from 'react-dom\/client'/g, "from 'octane'");
	out = out.replace(/from "react-dom\/client"/g, 'from "octane"');
	out = out.replace(/from 'react-dom'/g, "from 'octane'");
	out = out.replace(/from "react-dom"/g, 'from "octane"');
	out = out.replace(/from '@tanstack\/react-store'/g, "from '@octanejs/tanstack-store'");
	out = out.replace(/from "@tanstack\/react-store"/g, 'from "@octanejs/tanstack-store"');
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
	out = out.replace(/\bReactNode\b/g, 'OctaneNode');
	out = out.replace(/\bJSX\.Element\b/g, 'Octane.JSX.Element');
	out = out.replace(/\bMutableRefObject\b/g, 'RefObject');
	out = out.replace(/React\.memo\b/g, 'memo');
	out = out.replace(/React\.FC\b/g, 'FC');
	out = out.replace(/React\.CSSProperties\b/g, 'CSSProperties');
	out = out.replace(/React\.Ref\b/g, 'Octane.Ref');
	out = out.replace(/React\.RefObject\b/g, 'RefObject');
	out = out.replace(/React\.ReactPortal\b/g, 'OctaneNode');

	if (basename(destRel) === 'BlockNoteView.tsx' || basename(destRel) === 'BlockNoteView.tsrx') {
		out = out.replace(/(\s)className=/g, '$1class=');
	}

	return out;
}

const reactShimBackup = existsSync(join(__dirname, '../src/react-shim.ts'))
	? readFileSync(join(__dirname, '../src/react-shim.ts'), 'utf8')
	: null;

rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST, { recursive: true });

const checkpoints = [];

for (const file of walk(SRC)) {
	const rel = relative(SRC, file);
	let destRel = rel;
	if (destRel.endsWith('.tsx')) destRel = destRel.replace(/\.tsx$/, '.tsrx');
	const dest = join(DEST, destRel);
	mkdirSync(dirname(dest), { recursive: true });

	if (file.endsWith('.ts') || file.endsWith('.tsx')) {
		let content = transformSource(readFileSync(file, 'utf8'), destRel);
		if (CHECKPOINT_FILES.has(rel)) {
			content = `// CHECKPOINT: manual review required — TipTap/react-dom integration boundary\n${content}`;
			checkpoints.push(rel);
		}
		writeFileSync(dest, content);
	} else {
		cpSync(file, dest);
	}
}

const indexSrc = readFileSync(join(SRC, 'index.ts'), 'utf8');
const indexOut = indexSrc.replace(/\.js(['"])/g, '.tsrx$1').replace(/\.js;/g, '.tsrx;');
writeFileSync(join(DEST, 'index.ts'), transformSource(indexOut, 'index.ts'));

if (reactShimBackup) {
	writeFileSync(join(DEST, 'react-shim.ts'), reactShimBackup);
}

console.log(`Ported into ${DEST}`);
if (checkpoints.length) {
	console.log('\nHuman checkpoint files (review before shipping milestone 1):');
	for (const rel of checkpoints.sort()) console.log(`  - ${rel}`);
}
