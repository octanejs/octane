import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { octane } from 'octane/compiler/vite';
import { createServer } from 'vite';
import { discoverTemplatePaths, isDirectory } from './templates.js';

/** @typedef {{ sourcePath: string, relativePath: string }} ExportedTemplate */
/** @typedef {{ pretty?: boolean, extension?: string }} ExportTemplatesOptions */

/**
 * Compile and export every default-exported `.tsrx` email beneath `emailsDirectoryPath`.
 * Nested paths are retained and `static/` is copied without entering the compiler graph.
 *
 * @param {string} outputDirectoryPath
 * @param {string} emailsDirectoryPath
 * @param {ExportTemplatesOptions} [options]
 * @returns {Promise<{ templates: ExportedTemplate[], outputDirectory: string }>}
 */
export async function exportTemplates(outputDirectoryPath, emailsDirectoryPath, options = {}) {
	const sourceDirectory = resolve(emailsDirectoryPath);
	const outputDirectory = resolve(outputDirectoryPath);
	await assertDirectory(sourceDirectory);
	assertSeparateDirectories(sourceDirectory, outputDirectory);
	const extension = normalizeExtension(options.extension ?? '.html');

	const templatePaths = (await discoverTemplatePaths(sourceDirectory)).sort((left, right) =>
		left.localeCompare(right),
	);
	await rm(outputDirectory, { recursive: true, force: true });
	await mkdir(outputDirectory, { recursive: true });

	const server = await createServer({
		root: sourceDirectory,
		configFile: false,
		appType: 'custom',
		logLevel: 'silent',
		plugins: [octane({ hmr: false, ssr: true })],
		server: { middlewareMode: true },
	});

	/** @type {ExportedTemplate[]} */
	const templates = [];
	try {
		const emailLibrary = await server.ssrLoadModule('@octanejs/email');
		if (typeof emailLibrary.render !== 'function') {
			throw new Error('@octanejs/email does not export render()');
		}

		for (const sourcePath of templatePaths) {
			const emailModule = await server.ssrLoadModule(sourcePath);
			if (typeof emailModule.default !== 'function') {
				throw new TypeError(
					`${relative(sourceDirectory, sourcePath)} must default-export an email component`,
				);
			}

			const sourceRelativePath = relative(sourceDirectory, sourcePath);
			const relativePath = replaceExtension(sourceRelativePath, extension);
			const destination = join(outputDirectory, relativePath);
			await mkdir(dirname(destination), { recursive: true });
			const html = await emailLibrary.render(emailModule.default, undefined, {
				pretty: options.pretty,
			});
			await writeFile(destination, html);
			templates.push({ sourcePath, relativePath });
		}
	} finally {
		await server.close();
	}

	const staticDirectory = join(sourceDirectory, 'static');
	if (await isDirectory(staticDirectory)) {
		await cp(staticDirectory, join(outputDirectory, 'static'), { recursive: true });
	}

	return { templates, outputDirectory };
}

/** @param {string} path */
async function assertDirectory(path) {
	if (!(await isDirectory(path))) throw new Error(`Email directory does not exist: ${path}`);
}

/** @param {string} sourceDirectory @param {string} outputDirectory */
function assertSeparateDirectories(sourceDirectory, outputDirectory) {
	if (
		containsPath(sourceDirectory, outputDirectory) ||
		containsPath(outputDirectory, sourceDirectory)
	) {
		throw new Error('Output and email source directories cannot contain each other');
	}
}

/** @param {string} parent @param {string} child */
function containsPath(parent, child) {
	const childPath = relative(parent, child);
	return (
		childPath === '' ||
		(!childPath.startsWith(`..${sep}`) && childPath !== '..' && !isAbsolute(childPath))
	);
}

/** @param {string} extension */
function normalizeExtension(extension) {
	if (!/^\.?[A-Za-z0-9]+$/.test(extension)) {
		throw new Error(`Invalid output extension: ${extension}`);
	}
	return extension.startsWith('.') ? extension : `.${extension}`;
}

/** @param {string} path @param {string} extension */
function replaceExtension(path, extension) {
	return path.slice(0, -extname(path).length) + extension;
}
