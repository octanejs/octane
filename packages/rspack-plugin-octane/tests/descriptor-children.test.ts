import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadDescriptorChildrenImports } from '../src/descriptor-children.js';

let root: string;

function write(relativePath: string, code: string) {
	const file = join(root, relativePath);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, code);
	return file;
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'octane-descriptor-cycle-'));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

it('does not inspect Octane runtime imports when a built-in is a JSX tag', async () => {
	const importer = write(
		'src/App.tsrx',
		`import { Hydrate } from 'octane'; export function App() @{ <Hydrate><main /></Hydrate> }`,
	);
	const getResolve = vi.fn();
	const result = await loadDescriptorChildrenImports(
		{ getResolve },
		`import { Hydrate } from 'octane'; export function App() @{ <Hydrate><main /></Hydrate> }`,
		importer,
	);
	expect(result).toBeNull();
	expect(getResolve).not.toHaveBeenCalled();
});

it('settles concurrent cyclic re-export lookups without claiming an unmarked component', async () => {
	const first = write('src/first.ts', `export { Slot } from './second.ts';\n`);
	const second = write('src/second.ts', `export { Slot } from './first.ts';\n`);
	const importer = write(
		'src/App.tsrx',
		`import { Slot as First } from './first.ts';
import { Slot as Second } from './second.ts';
export function App() @{ <main><First /><Second /></main> }
`,
	);
	const dependencies: string[] = [];
	const context = {
		getResolve: () => async (issuer: string, request: string) => resolve(issuer, request),
		addDependency: (filename: string) => dependencies.push(filename),
	};
	const proof = await loadDescriptorChildrenImports(
		context,
		`import { Slot as First } from './first.ts';
import { Slot as Second } from './second.ts';
export function App() @{ <main><First /><Second /></main> }
`,
		importer,
	);
	expect(proof).toBeNull();
	expect(new Set(dependencies)).toEqual(new Set([first, second]));
});
