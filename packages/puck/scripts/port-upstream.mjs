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
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addTsrxSpecifiers } from './tsrx-specifiers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const upstreamRoot = process.argv[2];
const DEST = process.argv[3] ? resolve(process.argv[3]) : join(__dirname, '../src');

const CORE_INDEX = join(upstreamRoot, 'bundle', 'core.ts');
const LEGACY_INDEX = join(upstreamRoot, 'src', 'index.ts');

if (!upstreamRoot || (!existsSync(CORE_INDEX) && !existsSync(LEGACY_INDEX))) {
	console.error('Usage: node port-upstream.mjs <path-to-puck/packages/core> [destination]');
	process.exit(1);
}

const COPY_DIRS = ['components', 'lib', 'store', 'reducer', 'types'];
const COPY_FILES = [
	'globals.d.ts',
	'styles.css',
	join('bundle', 'index.css'),
	join('bundle', 'core.css'),
];
const SKIP_DIR_NAMES = new Set(['__helpers__', '__tests__', '__mocks__', 'node_modules']);
const OMITTED_UPSTREAM_FILES = new Set([
	join('lib', 'is-ios.ts'),
	join('lib', 'plugin-debug.tsx'),
	join('lib', 'resolve-permissions.ts'),
	join('lib', 'use-frame.ts'),
	join('lib', 'use-on-value-change.ts'),
	join('lib', 'use-parent.ts'),
	join('lib', 'use-why-render.ts'),
]);

function walk(dir) {
	const out = [];
	for (const name of readdirSync(dir)) {
		if (SKIP_DIR_NAMES.has(name)) continue;
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

	out = out.replace(/from 'react-dom'/g, "from 'octane'");
	out = out.replace(/from "react-dom"/g, 'from "octane"');
	out = out.replace(
		/import type \{([^}]+)\} from 'react';/g,
		`import type {$1} from '${shimPath}';`,
	);
	out = out.replace(
		/import type \{([^}]+)\} from "react";/g,
		`import type {$1} from "${shimPath}";`,
	);
	out = out.replace(
		/import React, \{([^}]+)\} from 'react';/g,
		`import React, {$1} from '${shimPath}';`,
	);
	out = out.replace(
		/import React, \{([^}]+)\} from "react";/g,
		`import React, {$1} from "${shimPath}";`,
	);
	out = out.replace(/import React from 'react';/g, `import React from '${shimPath}';`);
	out = out.replace(/import React from "react";/g, `import React from "${shimPath}";`);
	out = out.replace(
		/import \{([^}]+)\} from 'react';/g,
		function replaceReactImport(_match, imports) {
			return `import {${imports}} from '${shimPath}';`;
		},
	);
	out = out.replace(
		/import \{([^}]+)\} from "react";/g,
		function replaceReactImport(_match, imports) {
			return `import {${imports}} from "${shimPath}";`;
		},
	);
	out = out.replace(/from 'react'/g, `from '${shimPath}'`);
	out = out.replace(/from "react"/g, `from "${shimPath}"`);
	out = out.replace(/from 'zustand\/react\/shallow'/g, "from '@octanejs/zustand/shallow'");
	out = out.replace(/from "zustand\/react\/shallow"/g, 'from "@octanejs/zustand/shallow"');
	out = out.replace(/from 'zustand\/middleware'/g, "from '@octanejs/zustand/middleware'");
	out = out.replace(/from "zustand\/middleware"/g, 'from "@octanejs/zustand/middleware"');
	out = out.replace(/from 'zustand\/vanilla'/g, "from '@octanejs/zustand/vanilla'");
	out = out.replace(/from "zustand\/vanilla"/g, 'from "@octanejs/zustand/vanilla"');
	out = out.replace(/from 'zustand\/traditional'/g, "from '@octanejs/zustand/traditional'");
	out = out.replace(/from "zustand\/traditional"/g, 'from "@octanejs/zustand/traditional"');
	out = out.replace(/from 'zustand'/g, "from '@octanejs/zustand'");
	out = out.replace(/from "zustand"/g, 'from "@octanejs/zustand"');
	out = out.replace(/from '@dnd-kit\/react\/sortable'/g, "from '@octanejs/dnd-kit/sortable'");
	out = out.replace(/from "@dnd-kit\/react\/sortable"/g, 'from "@octanejs/dnd-kit/sortable"');
	out = out.replace(/from '@dnd-kit\/react'/g, "from '@octanejs/dnd-kit'");
	out = out.replace(/from "@dnd-kit\/react"/g, 'from "@octanejs/dnd-kit"');
	out = out.replace(/from 'lucide-react'/g, "from '@octanejs/lucide'");
	out = out.replace(/from "lucide-react"/g, 'from "@octanejs/lucide"');
	out = out.replace(/from 'use-debounce'/g, "from '@octanejs/tanstack-pacer'");
	out = out.replace(/from "use-debounce"/g, 'from "@octanejs/tanstack-pacer"');
	out = out.replace(/\bReactNode\b/g, 'OctaneNode');
	out = out.replace(/\bMutableRefObject\b/g, 'RefObject');
	out = out.replace(/React\.memo\b/g, 'memo');
	out = out.replace(/React\.FC\b/g, 'FC');
	out = out.replace(/React\.FunctionComponent\b/g, 'FC');
	out = out.replace(/React\.ComponentType\b/g, 'ComponentType');
	out = out.replace(/React\.CSSProperties\b/g, 'CSSProperties');
	out = out.replace(/React\.RefObject\b/g, 'RefObject');
	out = out.replace(/React\.ForwardedRef\b/g, 'ForwardedRef');
	out = out.replace(/React\.FocusEvent\b/g, 'FocusEvent');
	out = out.replace(/React\.MouseEvent\b/g, 'MouseEvent');
	out = out.replace(/React\.SyntheticEvent\b/g, 'Event');

	// Octane JSX cannot parse generic component tags like <Foo<T>> or arrow types
	// like `(): () => void` inside JSX attribute expressions (the `>` closes the tag).
	out = out.replace(/<([A-Z][A-Za-z0-9]*)<[^>]+>/g, '<$1');
	out = out.replace(/\(\) => void \| undefined/g, '(() => void) | undefined');

	return out;
}

// Plain `.ts` modules reach Octane's base hooks through `react-shim.js`, not an
// `octane` import, so the compiler would leave their hook calls unslotted and
// every hook in one custom hook would share a single cell. The leading pragma
// declares the module Octane-owned, as `.tsrx` files already are.
function claimHookModule(text, destRel) {
	if (!destRel.endsWith('.ts') || destRel.endsWith('.d.ts')) return text;
	if (!/\buse[A-Z]\w*\(/.test(text)) return text;
	return `/** @jsxImportSource octane */\n${text}`;
}

function writeReactShim() {
	writeFileSync(
		join(DEST, 'react-shim.ts'),
		`import {
	createContext,
	createPortal,
	isValidElement,
	memo,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	useTransition,
} from 'octane';
import type { Context as OctaneContext, OctaneNode } from 'octane';
import type { JSX, Octane } from 'octane/jsx-runtime';

export {
	createContext,
	createPortal,
	isValidElement,
	memo,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	useTransition,
};

export type { JSX, Octane, OctaneNode as ReactNode, OctaneNode };

export type CSSProperties = Exclude<
	Octane.JSX.IntrinsicElements['div']['style'],
	string | undefined
>;

export type RefObject<T> = { current: T | null };
export type Ref<T> = Octane.Ref<T>;
export type RefAttributes<T> = { ref?: Ref<T> };
export type ForwardedRef<T> = Ref<T>;
export type PropsWithoutRef<P> = P;
export type PropsWithChildren<P = Record<string, unknown>> = P & { children?: OctaneNode };

export type FC<P = Record<string, unknown>> = (props: P) => OctaneNode;
export type ComponentType<P = Record<string, unknown>> = FC<P>;

export type Reducer<S, A> = (state: S, action: A) => S;
export type Context<T> = OctaneContext<T>;

export type Dispatch<A> = (value: A) => void;
export type SetStateAction<S> = S | ((previous: S) => S);
export type DependencyList = ReadonlyArray<unknown>;

export type ReactElement = OctaneNode;
export type ReactMouseEvent<T = Element> = MouseEvent;
export type SyntheticEvent<T = Element> = Event;

// Octane passes \`ref\` as an ordinary prop, so upstream's \`forwardRef\` render
// functions get it back as their second argument here. Returning \`render\`
// itself would call it with props alone and drop every forwarded ref.
export function forwardRef<T, P = Record<string, unknown>>(
	render: (props: P, ref: ForwardedRef<T>) => OctaneNode,
): FC<P & RefAttributes<T>> {
	return function ForwardRef(props) {
		return render(props, props.ref ?? null);
	};
}

const React = {
	createContext,
	createPortal,
	isValidElement,
	memo,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	useTransition,
	forwardRef,
};

export default React;
`,
	);
}

rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST, { recursive: true });
writeReactShim();

for (const dirName of COPY_DIRS) {
	const sourceDir = join(upstreamRoot, dirName);
	if (!existsSync(sourceDir)) continue;
	for (const file of walk(sourceDir)) {
		const rel = relative(upstreamRoot, file);
		if (OMITTED_UPSTREAM_FILES.has(rel)) continue;
		let destRel = rel;
		if (destRel.endsWith('.tsx')) destRel = destRel.replace(/\.tsx$/, '.tsrx');
		const dest = join(DEST, destRel);
		mkdirSync(dirname(dest), { recursive: true });
		if (file.endsWith('.ts') || file.endsWith('.tsx')) {
			const text = transformSource(readFileSync(file, 'utf8'), destRel);
			writeFileSync(dest, claimHookModule(text, destRel));
		} else {
			cpSync(file, dest);
		}
	}
}

for (const fileName of COPY_FILES) {
	const sourceFile = join(upstreamRoot, fileName);
	if (!existsSync(sourceFile)) continue;
	const dest = join(DEST, fileName);
	mkdirSync(dirname(dest), { recursive: true });
	cpSync(sourceFile, dest);
}

const stylesDir = join(upstreamRoot, 'styles');
if (existsSync(stylesDir)) {
	cpSync(stylesDir, join(DEST, 'styles'), { recursive: true });
}

writeFileSync(
	join(DEST, 'index.ts'),
	`// @octanejs/puck — @measured/puck for the octane renderer.
// Public surface mirrors upstream bundle/core.ts (@measured/puck@0.20.2).

import './styles.css';

export type { PuckAction } from './reducer/actions';

export * from './types/API';
export * from './types';
export * from './types/Data';
export * from './types/Props';
export * from './types/Fields';

export * from './components/ActionBar';
export { AutoField, FieldLabel } from './components/AutoField';

export * from './components/Button';
export { Drawer } from './components/Drawer';

export { DropZone } from './components/DropZone';
export * from './components/IconButton';
export { Puck } from './components/Puck';
export * from './components/Render';

export * from './lib/migrate';
export * from './lib/transform-props';
export { registerOverlayPortal } from './lib/overlay-portal';
export * from './lib/resolve-all-data';
export { setDeep } from './lib/data/set-deep';
export { walkTree } from './lib/data/walk-tree';
export {
  createUsePuck,
  usePuck,
  useGetPuck,
  type UsePuckData,
  type PuckApi,
} from './lib/use-puck';
`,
);

addTsrxSpecifiers(DEST);

console.log(`Ported into ${DEST}`);
