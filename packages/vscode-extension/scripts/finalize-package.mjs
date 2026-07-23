import { createWriteStream } from 'node:fs';
import { readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const vsceRequire = createRequire(require.resolve('@vscode/vsce/package.json'));
const yauzl = vsceRequire('yauzl');
const yazl = vsceRequire('yazl');
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vsixPath = path.join(packageRoot, 'dist/octane-vscode.vsix');
const temporaryPath = `${vsixPath}.tmp`;
const extensionManifest = JSON.parse(
	await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
);

/** @returns {Promise<Array<{ entry: any, contents: Buffer }>>} */
function readArchive() {
	return new Promise((resolve, reject) => {
		yauzl.open(vsixPath, { lazyEntries: true }, (openError, archive) => {
			if (openError) return reject(openError);
			const files = [];
			archive.on('error', reject);
			archive.on('end', () => resolve(files));
			archive.on('entry', (entry) => {
				if (entry.fileName.endsWith('/')) {
					archive.readEntry();
					return;
				}
				archive.openReadStream(entry, (streamError, stream) => {
					if (streamError) return reject(streamError);
					const chunks = [];
					stream.on('error', reject);
					stream.on('data', (chunk) => chunks.push(chunk));
					stream.on('end', () => {
						files.push({ entry, contents: Buffer.concat(chunks) });
						archive.readEntry();
					});
				});
			});
			archive.readEntry();
		});
	});
}

const files = await readArchive();
const zip = new yazl.ZipFile();
for (const { entry, contents } of files) {
	zip.addBuffer(contents, entry.fileName, {
		mtime: entry.getLastModDate(),
		mode: entry.externalFileAttributes >>> 16,
	});
}
zip.addBuffer(
	await readFile(path.join(packageRoot, 'dist/tsserver-plugin.cjs')),
	'extension/node_modules/@octanejs/typescript-plugin/index.cjs',
);
zip.addBuffer(
	Buffer.from(
		`${JSON.stringify(
			{
				name: '@octanejs/typescript-plugin',
				version: extensionManifest.version,
				private: true,
				main: './index.cjs',
			},
			null,
			2,
		)}\n`,
	),
	'extension/node_modules/@octanejs/typescript-plugin/package.json',
);
zip.end();

await new Promise((resolve, reject) => {
	const output = createWriteStream(temporaryPath);
	zip.outputStream.pipe(output);
	zip.outputStream.once('error', reject);
	output.once('error', reject);
	output.once('finish', resolve);
});
await rename(temporaryPath, vsixPath);
