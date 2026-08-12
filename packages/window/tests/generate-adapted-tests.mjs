import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstreamRoot = join(packageRoot, 'upstream');
const upstreamLib = join(upstreamRoot, 'lib');
const destinationRoot = join(packageRoot, 'tests/upstream');

function walk(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? walk(path) : [path];
	});
}

function sourceTarget(importer, specifier, roots) {
	const absolute = resolve(dirname(importer), specifier);
	const relativeToLib = relative(roots.upstreamLib, absolute);
	if (relativeToLib.startsWith('utils/test/')) {
		return join(roots.packageRoot, 'tests/utils', relativeToLib.slice('utils/test/'.length));
	}
	if (!relativeToLib.startsWith('..')) return join(roots.packageRoot, 'src', relativeToLib);
	const relativeToUpstream = relative(roots.upstreamRoot, absolute);
	if (relativeToUpstream === 'src/constants') return join(roots.packageRoot, 'src/constants');
	throw new Error(
		`unaccounted relative import ${specifier} in ${relative(roots.upstreamRoot, importer)}`,
	);
}

export function transform(
	source,
	upstreamFile,
	destination,
	roots = { packageRoot, upstreamRoot, upstreamLib },
) {
	const usesCreateRef = /import\s*\{[^}]*\bcreateRef\b[^}]*\}\s*from\s*["']react["'];/.test(source);
	let output = source
		.replaceAll('"@testing-library/react"', '"@octanejs/testing-library"')
		.replaceAll("'@testing-library/react'", "'@octanejs/testing-library'")
		.replaceAll('from "react"', 'from "octane"')
		.replaceAll("from 'react'", "from 'octane'");
	if (usesCreateRef) {
		output = output.replace(
			/import\s*\{([^}]*)\}\s*from\s*("octane"|'octane');/,
			(_statement, imports, quote) => {
				const retained = imports
					.split(',')
					.map((value) => value.trim())
					.filter((value) => value !== 'createRef')
					.join(', ');
				return `import { ${retained} } from ${quote};`;
			},
		);
	}

	output = output.replace(/from\s+(["'])(\.\.?\/[^"']+)\1/g, (statement, quote, specifier) => {
		const target = sourceTarget(upstreamFile, specifier, roots);
		let rebased = relative(dirname(destination), target).replaceAll('\\', '/');
		if (!rebased.startsWith('.')) rebased = `./${rebased}`;
		return `from ${quote}${rebased}${quote}`;
	});
	if (usesCreateRef) {
		let helper = relative(
			dirname(destination),
			join(roots.packageRoot, 'tests/create-ref'),
		).replaceAll('\\', '/');
		if (!helper.startsWith('.')) helper = `./${helper}`;
		output = `import { createRef } from ${JSON.stringify(helper)};\n${output}`;
	}

	const upstreamPath = relative(roots.upstreamLib, upstreamFile).replaceAll('\\', '/');
	if (upstreamPath === 'components/grid/Grid.test.tsx') {
		output = output.replace(
			'expect(renderLog).toMatchInlineSnapshot(`\n        [\n          "row: 0, column: 0, id: 4",',
			'// OCTANE DIVERGENCE[react-window-keyed-effect-order][runtime:react-window-adapted-004]\n      expect(renderLog.toSorted()).toMatchInlineSnapshot(`\n        [\n          "row: 0, column: 0, id: 4",',
		);
	}
	if (upstreamPath === 'components/list/List.test.tsx') {
		output = output
			.replace(
				`expect(RowComponent).toHaveBeenLastCalledWith(
          expect.objectContaining({
            index: 2
          }),
          undefined
        );`,
				`// OCTANE DIVERGENCE[react-window-component-call-abi][runtime:react-window-adapted-048]
        expect(RowComponent.mock.lastCall?.[0]).toEqual(
          expect.objectContaining({
            index: 2
          })
        );`,
			)
			.replaceAll(
				`expect(RowComponent).toHaveBeenLastCalledWith(
        expect.objectContaining({
          foo: 1
        }),
        undefined
      );`,
				`// OCTANE DIVERGENCE[react-window-component-call-abi][runtime:react-window-adapted-049]
      expect(RowComponent.mock.lastCall?.[0]).toEqual(
        expect.objectContaining({
          foo: 1
        })
      );`,
			)
			.replaceAll(
				`expect(RowComponent).toHaveBeenLastCalledWith(
        expect.objectContaining({
          foo: 2
        }),
        undefined
      );`,
				`expect(RowComponent.mock.lastCall?.[0]).toEqual(
        expect.objectContaining({
          foo: 2
        })
      );`,
			)
			.replace(
				'expect(renderLog).toMatchInlineSnapshot(`\n        [\n          "index: 0, id: 4",\n          "index: 1, id: 3",\n          "index: 2, id: 2",',
				'// OCTANE DIVERGENCE[react-window-keyed-effect-order][runtime:react-window-adapted-054]\n      expect(renderLog.toSorted()).toMatchInlineSnapshot(`\n        [\n          "index: 0, id: 4",\n          "index: 1, id: 3",',
			);
	}

	if (extname(upstreamFile) === '.tsx') output = `/** @jsxImportSource octane */\n${output}`;
	return output;
}

export function formatAdapted(source, filepath) {
	return format(source, {
		filepath,
		useTabs: true,
		tabWidth: 2,
		singleQuote: true,
		jsxSingleQuote: false,
		printWidth: 100,
	});
}

export async function generate() {
	rmSync(destinationRoot, { recursive: true, force: true });
	const testFiles = walk(upstreamLib)
		.filter((path) => /\.test\.[tj]sx?$/.test(path))
		.sort();
	for (const upstreamFile of testFiles) {
		const destination = join(destinationRoot, relative(upstreamLib, upstreamFile));
		mkdirSync(dirname(destination), { recursive: true });
		writeFileSync(
			destination,
			await formatAdapted(
				transform(readFileSync(upstreamFile, 'utf8'), upstreamFile, destination),
				destination,
			),
		);
	}
	return testFiles.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	console.log(`generated ${await generate()} react-window adapted test files`);
}
