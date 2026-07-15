import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const packageRoot = resolve(import.meta.dirname, '..');
const sourceRoot = join(packageRoot, 'src');
const converting = process.argv.includes('--convert');
const convertingHooks = process.argv.includes('--convert-hooks');
const normalizing = process.argv.includes('--normalize');
const checking = process.argv.includes('--check');

function filesUnder(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? filesUnder(path) : [path];
	});
}

function replaceRelativeSpecifiers(source, transform) {
	return source.replace(
		/(\b(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"])(\.{1,2}\/[^'"]+)(['"])/g,
		(match, before, specifier, after) => `${before}${transform(specifier)}${after}`,
	);
}

function resolveComponent(fromFile, specifier, componentExtension) {
	const target = resolve(dirname(fromFile), specifier);
	const candidates = extname(target)
		? [target]
		: [`${target}${componentExtension}`, join(target, `index${componentExtension}`)];
	return candidates.find(existsSync);
}

function stripJsxTypeArguments(source) {
	let output = '';
	let index = 0;
	while (index < source.length) {
		if (source[index] !== '<' || !/[A-Z]/.test(source[index + 1] ?? '')) {
			output += source[index++];
			continue;
		}

		let nameEnd = index + 2;
		while (/[A-Za-z0-9_.$]/.test(source[nameEnd] ?? '')) nameEnd++;
		if (source[nameEnd] !== '<') {
			output += source[index++];
			continue;
		}

		let depth = 0;
		let typeEnd = nameEnd;
		for (; typeEnd < source.length; typeEnd++) {
			if (source[typeEnd] === '<') depth++;
			// A function type's `=>` belongs inside the type argument; only a bare
			// `>` closes the generic list.
			if (source[typeEnd] === '>' && source[typeEnd - 1] !== '=') depth--;
			if (depth === 0) break;
		}
		let next = typeEnd + 1;
		while (/\s/.test(source[next] ?? '')) next++;
		const looksLikeJsxAttribute =
			/[A-Za-z/]/.test(source[next] ?? '') || source.startsWith('{...', next);
		if (!looksLikeJsxAttribute) {
			output += source[index++];
			continue;
		}

		output += source.slice(index, nameEnd);
		index = typeEnd + 1;
	}
	return output;
}

if (converting) {
	const components = filesUnder(sourceRoot).filter((file) => file.endsWith('.tsx'));
	const componentSet = new Set(components);

	for (const file of filesUnder(sourceRoot).filter((path) => /\.(?:ts|tsx)$/.test(path))) {
		const source = readFileSync(file, 'utf8');
		const updated = replaceRelativeSpecifiers(source, (specifier) => {
			const component = resolveComponent(file, specifier, '.tsx');
			if (!component || !componentSet.has(component)) return specifier;
			let explicit = relative(dirname(file), component).replaceAll('\\', '/');
			if (!explicit.startsWith('.')) explicit = `./${explicit}`;
			return explicit.replace(/\.tsx$/, '.tsrx');
		});
		if (updated !== source) writeFileSync(file, updated);
	}

	for (const component of components) {
		renameSync(component, component.replace(/\.tsx$/, '.tsrx'));
	}
}

if (convertingHooks) {
	const hooks = filesUnder(sourceRoot).filter((file) => {
		if (!file.endsWith('.ts') || file.endsWith('.d.ts')) return false;
		const name = basename(file);
		return /^use[A-Z].*\.ts$/.test(name) || file.endsWith('/internal/spring.ts');
	});
	const hookSet = new Set(hooks);

	for (const file of filesUnder(sourceRoot).filter((path) => /\.(?:ts|tsrx)$/.test(path))) {
		const source = readFileSync(file, 'utf8');
		const updated = replaceRelativeSpecifiers(source, (specifier) => {
			const hook = resolveComponent(file, specifier, '.ts');
			if (!hook || !hookSet.has(hook)) return specifier;
			let explicit = relative(dirname(file), hook).replaceAll('\\', '/');
			if (!explicit.startsWith('.')) explicit = `./${explicit}`;
			return explicit.replace(/\.ts$/, '.tsrx');
		});
		if (updated !== source) writeFileSync(file, updated);
	}

	for (const hook of hooks) {
		renameSync(hook, hook.replace(/\.ts$/, '.tsrx'));
	}
}

if (normalizing) {
	for (const file of filesUnder(sourceRoot).filter((path) => path.endsWith('.tsrx'))) {
		const source = readFileSync(file, 'utf8');
		const updated = stripJsxTypeArguments(source);
		if (updated !== source) writeFileSync(file, updated);
	}
}

const components = filesUnder(sourceRoot).filter((file) => file.endsWith('.tsrx'));
const temporaryRoot = mkdtempSync(join(tmpdir(), 'octane-visx-types-'));
const temporarySource = join(temporaryRoot, 'src');
const temporaryOutput = join(temporaryRoot, 'out');

try {
	symlinkSync(join(packageRoot, 'node_modules'), join(temporaryRoot, 'node_modules'), 'dir');
	for (const file of filesUnder(sourceRoot).filter(
		(path) => path.endsWith('.ts') || path.endsWith('.tsrx'),
	)) {
		const relativePath = relative(sourceRoot, file).replace(/\.tsrx$/, '.tsx');
		const target = join(temporarySource, relativePath);
		const source = replaceRelativeSpecifiers(readFileSync(file, 'utf8'), (specifier) =>
			specifier.endsWith('.tsrx') ? specifier.replace(/\.tsrx$/, '.tsx') : specifier,
		);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, source);
	}

	const roots = components.map((file) =>
		join(temporarySource, relative(sourceRoot, file).replace(/\.tsrx$/, '.tsx')),
	);
	const program = ts.createProgram(roots, {
		declaration: true,
		emitDeclarationOnly: true,
		esModuleInterop: true,
		jsx: ts.JsxEmit.Preserve,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		noCheck: true,
		outDir: temporaryOutput,
		preserveSymlinks: true,
		rootDir: temporarySource,
		skipLibCheck: true,
		strictNullChecks: true,
		target: ts.ScriptTarget.ESNext,
		types: ['react'],
	});
	const result = program.emit();
	if (result.emitSkipped) {
		const diagnostics = [...ts.getPreEmitDiagnostics(program), ...result.diagnostics]
			.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
			.join('\n');
		throw new Error(`TypeScript skipped Visx declaration generation.\n${diagnostics}`);
	}

	const changed = [];
	for (const component of components) {
		const emitted = join(
			temporaryOutput,
			relative(sourceRoot, component).replace(/\.tsrx$/, '.d.ts'),
		);
		const declaration =
			`// Generated by scripts/generate-tsrx-types.mjs.\n${replaceRelativeSpecifiers(
				readFileSync(emitted, 'utf8'),
				(specifier) =>
					specifier.endsWith('.tsx') ? specifier.replace(/\.tsx$/, '.tsrx') : specifier,
			)}`.replace(/[ \t]+$/gm, '');
		const destination = `${component}.d.ts`;
		if (!existsSync(destination) || readFileSync(destination, 'utf8') !== declaration) {
			changed.push(relative(packageRoot, destination));
			if (!checking) writeFileSync(destination, declaration);
		}
	}

	if (checking && changed.length) {
		throw new Error(`Stale Visx TSRX declarations:\n${changed.join('\n')}`);
	}
} finally {
	rmSync(temporaryRoot, { force: true, recursive: true });
}

console.log(`Visx TSRX declarations are current (${components.length} components).`);
