import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const temp = mkdtempSync(resolve(tmpdir(), 'octane-react-dropzone-pack-'));
const run = (command, args, cwd = root) => {
	const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
	if (result.status !== 0)
		throw new Error(`${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
	return result.stdout;
};
run('pnpm', ['pack', '--pack-destination', temp]);
const tarball = resolve(
	temp,
	readdirSync(temp).find((file) => file.endsWith('.tgz')),
);
run('tar', ['-xzf', tarball, '-C', temp]);
const pkg = JSON.parse(readFileSync(resolve(temp, 'package/package.json'), 'utf8'));
const expectedRoot = {
	types: './src/index.tsrx',
	import: './src/index.tsrx',
	require: './src/index.tsrx',
};
if (JSON.stringify(pkg.exports['.']) !== JSON.stringify(expectedRoot))
	throw new Error('packed root conditions drifted');
if (pkg.exports['./package.json'] !== './package.json')
	throw new Error('packed ./package.json export missing');
const source = readFileSync(resolve(temp, 'package/src/index.tsrx'), 'utf8');
for (const name of ['Dropzone', 'useDropzone', 'ErrorCode']) {
	if (!source.includes(name)) throw new Error(`packed runtime export missing: ${name}`);
}
for (const name of [
	'Accept',
	'AcceptGroup',
	'DropEvent',
	'DropzoneInputProps',
	'DropzoneOptions',
	'DropzoneProps',
	'DropzoneRef',
	'DropzoneRootProps',
	'DropzoneState',
	'FileError',
	'FileRejection',
	'FileWithPath',
	'ValidatorResult',
]) {
	if (!source.includes(name)) throw new Error(`packed type export missing: ${name}`);
}
if (/from ['"]react['"]|React\./.test(source))
	throw new Error('React leaked into packed source or public types');
if (readdirSync(resolve(temp, 'package')).includes('upstream'))
	throw new Error('upstream evidence leaked into package');
console.log('packed ESM/CJS/types/package-json conditions and public namespace verified');
