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

const CORE_INDEX = join(upstreamRoot, 'bundle', 'core.ts');
const LEGACY_INDEX = join(upstreamRoot, 'src', 'index.ts');

if (!upstreamRoot || (!existsSync(CORE_INDEX) && !existsSync(LEGACY_INDEX))) {
	console.error('Usage: node port-upstream.mjs <path-to-puck/packages/core>');
	process.exit(1);
}

const COPY_DIRS = ['components', 'lib', 'store', 'reducer', 'types'];
const COPY_FILES = ['globals.d.ts', 'styles.css'];
const SKIP_DIR_NAMES = new Set(['__tests__', '__mocks__', 'node_modules']);

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
	out = out.replace(/\bJSX\.Element\b/g, 'Octane.JSX.Element');
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

function writeReactShim() {
	writeFileSync(
		join(DEST, 'react-shim.ts'),
		`import {
	createContext,
	createPortal,
	memo,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from 'octane';
import type { OctaneNode } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

export {
	createContext,
	createPortal,
	memo,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
};

export type { OctaneNode as ReactNode, OctaneNode };

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
export type Context<T> = { Provider: FC<{ value: T; children?: OctaneNode }> };

export type Dispatch<A> = (value: A) => void;
export type SetStateAction<S> = S | ((previous: S) => S);
export type DependencyList = ReadonlyArray<unknown>;

export type ReactElement = OctaneNode;
export type ReactMouseEvent<T = Element> = MouseEvent;
export type SyntheticEvent<T = Element> = Event;

export function forwardRef<T, P extends Record<string, unknown>>(
	render: (props: P & { ref?: Ref<T> }) => OctaneNode,
): FC<P & { ref?: Ref<T> }> {
	return render;
}

export namespace Octane {
	export namespace JSX {
		export type Element = OctaneNode;
	}
}

const React = {
	createContext,
	createPortal,
	memo,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
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

console.log(`Ported into ${DEST}`);
