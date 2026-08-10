import { basename, join } from 'node:path';

function hashString(value) {
	let hash = 5381;
	for (let index = 0; index < value.length; index++)
		hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
	return Math.abs(hash).toString(36);
}

export function compileFixture(sourcePath, cacheDirectory, dependencies) {
	const compiled = dependencies.compile(dependencies.readFile(sourcePath, 'utf8'), sourcePath);
	if (compiled.errors?.length)
		throw new Error(
			`React fixture compilation failed for ${sourcePath}: ${JSON.stringify(compiled.errors)}`,
		);
	const transformed = dependencies.transform(compiled.code, {
		loader: 'tsx',
		jsx: 'automatic',
		jsxImportSource: 'react',
		target: 'esnext',
		format: 'esm',
		sourcefile: sourcePath,
	});
	const rewritten = transformed.code
		.replace(/from\s+["']@octanejs\/apollo-client\/react["']/g, 'from "@apollo/client/react"')
		.replace(/from\s+["']octane["']/g, 'from "react"');
	if (
		/(?:from|import)\s+["']@octanejs\//.test(rewritten) ||
		/from\s+["']octane["']/.test(rewritten)
	) {
		throw new Error(
			`React fixture rewrite left Octane-only imports in ${sourcePath}; keep differential oracles under _fixtures/differential`,
		);
	}
	const slug = basename(sourcePath).replace(/\.tsrx$/, '');
	dependencies.writeFile(join(cacheDirectory, `${slug}-${hashString(sourcePath)}.js`), rewritten);
}
