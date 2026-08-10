import { spawnSync } from 'node:child_process';
import {
	existsSync,
	lstatSync,
	mkdtempSync,
	readdirSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { resolveFileSelection } from './file-selection.mjs';

// `upstream` holds byte-exact vendored source a port is written against. It is
// provenance, not repository source: its own tsconfig belongs to the upstream
// build and may not even resolve from the vendored path. Ports validate it with
// their pristine type lanes and the upstream compiler instead. `.prettierignore`
// excludes the same trees for the same reason.
const IGNORED_DIRECTORIES = new Set(['.git', 'coverage', 'dist', 'node_modules', 'upstream']);
const SOURCE_FILE_PATTERN = /(?:\.d)?\.(?:[cm]?ts|tsx|[cm]?js|jsx)$|\.tsrx$/;

function isTypecheckConfig(file) {
	const name = path.basename(file);
	return (
		name === 'tsconfig.json' ||
		(/^tsconfig\..+\.json$/.test(name) && name !== 'tsconfig.build.json')
	);
}

function configsInDirectory(directory) {
	return readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isFile() && isTypecheckConfig(entry.name))
		.map((entry) => path.join(directory, entry.name))
		.sort();
}

function sourceFilesInDirectory(directory) {
	const files = [];
	const entries = readdirSync(directory, { withFileTypes: true });
	for (const entry of entries) {
		if (entry.isFile() && SOURCE_FILE_PATTERN.test(entry.name)) {
			files.push(path.join(directory, entry.name));
		} else if (entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name)) {
			files.push(...sourceFilesInDirectory(path.join(directory, entry.name)));
		}
	}
	return files.sort();
}

function projectSearchRoot(cwd) {
	const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
		cwd,
		encoding: 'utf8',
	});
	return realpathSync(result.status === 0 ? result.stdout.trimEnd() : cwd);
}

function isWithin(directory, file) {
	const relative = path.relative(directory, file);
	return (
		relative === '' ||
		(!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
	);
}

function showProject(config) {
	const result = spawnSync('tsrx-tsc', ['--showConfig', '-p', config], {
		encoding: 'utf8',
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		process.stdout.write(result.stdout ?? '');
		process.stderr.write(result.stderr ?? '');
		throw new Error(`Could not read TypeScript project ${config}.`);
	}

	let shown;
	try {
		shown = JSON.parse(result.stdout);
	} catch {
		throw new Error(`TypeScript returned invalid configuration JSON for ${config}.`);
	}

	const directory = path.dirname(config);
	const files = (shown.files ?? []).map((file) => path.resolve(directory, file));
	return {
		config,
		files,
		fileSet: new Set(files),
		checker: files.some((file) => file.endsWith('.tsrx')) ? 'tsrx-tsc' : 'tsgo',
		incremental: Boolean(shown.compilerOptions?.composite || shown.compilerOptions?.incremental),
	};
}

function findOwningProjects(file, projectForConfig, searchRoot) {
	if (!isWithin(searchRoot, file)) return [];

	let directory = path.dirname(file);
	for (;;) {
		const projects = configsInDirectory(directory).map(projectForConfig);
		if (projects.length > 0) {
			const includingProjects = projects.filter((project) => project.fileSet.has(file));
			if (includingProjects.length > 0) return includingProjects;
			return [
				projects.find((project) => path.basename(project.config) === 'tsconfig.json') ??
					projects[0],
			];
		}

		if (directory === searchRoot) return [];
		const parent = path.dirname(directory);
		if (parent === directory || !isWithin(searchRoot, parent)) return [];
		directory = parent;
	}
}

function addSelectedFile(projects, project, file) {
	let selected = projects.get(project.config);
	if (!selected) {
		selected = { project, files: new Set() };
		projects.set(project.config, selected);
	}
	selected.files.add(file);
}

function selectProjects(selection, searchRoot) {
	const projectCache = new Map();
	const projectForConfig = (config) => {
		let project = projectCache.get(config);
		if (!project) {
			project = showProject(config);
			projectCache.set(config, project);
		}
		return project;
	};
	const projects = new Map();
	const unownedFiles = [];

	for (const selectedPath of selection.paths) {
		const resolvedPath = path.resolve(selection.workingDirectory, selectedPath);
		if (!existsSync(resolvedPath)) {
			throw new Error(`Path does not exist: ${selectedPath}`);
		}
		const absolutePath = realpathSync(resolvedPath);

		const stat = lstatSync(absolutePath);
		if (stat.isFile()) {
			if (isTypecheckConfig(absolutePath)) {
				const project = projectForConfig(absolutePath);
				for (const file of project.files) addSelectedFile(projects, project, file);
			} else if (SOURCE_FILE_PATTERN.test(absolutePath)) {
				const owners = findOwningProjects(absolutePath, projectForConfig, searchRoot);
				if (owners.length === 0) unownedFiles.push(selectedPath);
				for (const project of owners) addSelectedFile(projects, project, absolutePath);
			}
			continue;
		}

		if (!stat.isDirectory()) continue;
		for (const file of sourceFilesInDirectory(absolutePath)) {
			for (const project of findOwningProjects(file, projectForConfig, searchRoot)) {
				addSelectedFile(projects, project, file);
			}
		}
	}

	if (!selection.usesGitPaths && unownedFiles.length > 0) {
		throw new Error(
			`No TypeScript project includes: ${unownedFiles.map((file) => JSON.stringify(file)).join(', ')}`,
		);
	}

	return [...projects.values()].sort((left, right) =>
		left.project.config.localeCompare(right.project.config),
	);
}

function runProjects(selectedProjects, workingDirectory) {
	for (const [index, { project, files }] of selectedProjects.entries()) {
		const temporaryDirectory = mkdtempSync(
			path.join(path.dirname(project.config), '.typecheck-files-'),
		);
		try {
			const declarationFiles = project.files.filter((file) => /\.d\.[cm]?ts$/.test(file));
			const roots = [...new Set([...files, ...declarationFiles])].sort();
			const hasJavaScript = [...files].some((file) => /\.[cm]?jsx?$/.test(file));
			const hasTsrx = [...files].some((file) => file.endsWith('.tsrx'));
			const checker = project.checker === 'tsrx-tsc' || hasTsrx ? 'tsrx-tsc' : 'tsgo';
			const temporaryConfig = path.join(temporaryDirectory, `tsconfig-${index}.json`);
			writeFileSync(
				temporaryConfig,
				`${JSON.stringify(
					{
						extends: project.config,
						compilerOptions: {
							noEmit: true,
							...(hasJavaScript ? { allowJs: true } : {}),
							...(hasJavaScript || hasTsrx ? { skipLibCheck: true } : {}),
							...(hasTsrx ? { jsx: 'react-jsx', jsxImportSource: 'octane' } : {}),
							...(project.incremental
								? {
										composite: false,
										incremental: true,
										tsBuildInfoFile: path.join(temporaryDirectory, `project-${index}.tsbuildinfo`),
									}
								: {}),
						},
						files: roots,
						include: [],
						exclude: [],
					},
					null,
					2,
				)}\n`,
			);

			const relativeConfig = path.relative(workingDirectory, project.config) || project.config;
			console.log(
				`Typechecking ${files.size} selected file${files.size === 1 ? '' : 's'} from ${relativeConfig} with ${checker}.`,
			);
			const result = spawnSync(checker, ['--noEmit', '-p', temporaryConfig], {
				cwd: workingDirectory,
				stdio: 'inherit',
			});
			if (result.error) throw result.error;
			if (result.status !== 0) return result.status ?? 1;
		} finally {
			try {
				rmSync(temporaryDirectory, { force: true, recursive: true });
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				console.warn(
					`Could not remove temporary typecheck directory ${temporaryDirectory}: ${detail}`,
				);
			}
		}
	}
	return 0;
}

function parseArguments(argv) {
	const [separator, ...paths] = argv;
	if (separator !== '--') {
		throw new Error('Usage: node scripts/typecheck-files.mjs -- [path ...]');
	}
	return paths;
}

function main() {
	const paths = parseArguments(process.argv.slice(2));
	const selection = resolveFileSelection(paths);
	if (selection.paths.length === 0) {
		console.log('No staged or unstaged files to typecheck.');
		return 0;
	}

	const projects = selectProjects(selection, projectSearchRoot(selection.workingDirectory));
	if (projects.length === 0) {
		console.log('No selected files are covered by a TypeScript project.');
		return 0;
	}
	return runProjects(projects, selection.workingDirectory);
}

try {
	process.exitCode = main();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}
