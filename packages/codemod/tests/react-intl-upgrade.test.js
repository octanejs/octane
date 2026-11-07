import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { runCodemod } from '../dist/index.js';
import { bundleRuntime } from './bundle-runtime.js';

const previous = fs.readFileSync(
	new URL('./fixtures/react-intl/previous-helper.tsrx', import.meta.url),
	'utf8',
);
const current = fs.readFileSync(new URL('../templates/react-intl.tsrx', import.meta.url), 'utf8');
const page = `import {FormattedMessage} from 'react-intl';
export function Greeting({name}: {name: string}) {
	return <p><FormattedMessage id="greeting" values={{name}} /></p>;
}`;
const provider = `import {IntlProvider} from './octane-react-intl.tsrx';
export function PreviouslyMigrated({children}) @{
	<IntlProvider locale="en" messages={{greeting: 'Hello, {name}!'}}>{children}</IntlProvider>
}`;
let root;
function project() {
	root = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-intl-upgrade-'));
	fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
	fs.symlinkSync(
		path.join(import.meta.dirname, '../node_modules'),
		path.join(root, 'node_modules'),
		'dir',
	);
	const src = path.join(root, 'src');
	fs.mkdirSync(src);
	const helper = path.join(src, 'octane-react-intl.tsrx');
	const input = path.join(src, 'Greeting.tsx');
	fs.writeFileSync(input, page);
	fs.writeFileSync(path.join(src, 'PreviouslyMigrated.tsrx'), provider);
	return { src, helper, input };
}
afterEach(() => {
	vi.restoreAllMocks();
	if (root) fs.rmSync(root, { recursive: true, force: true });
});

it('previews and atomically upgrades the released helper while sharing context with an existing consumer', async () => {
	const { src, helper, input } = project();
	fs.writeFileSync(helper, previous);
	fs.chmodSync(helper, 0o640);
	const previousInode = path.join(root, 'original-helper');
	fs.linkSync(helper, previousInode);
	const preview = await runCodemod([input], { root, strong: true, write: false });
	expect(preview.files.find((f) => f.rules['react-intl-adapter'])).toMatchObject({
		changed: true,
		output: 'src/octane-react-intl.tsrx',
		code: current,
	});
	expect(fs.readFileSync(helper, 'utf8')).toBe(previous);
	const result = await runCodemod([input], { root, strong: true });
	expect(result.files.flatMap((f) => f.notes).filter((n) => n.severity === 'error')).toEqual([]);
	expect(fs.readFileSync(helper, 'utf8')).toBe(current);
	expect(fs.readFileSync(previousInode, 'utf8')).toBe(previous);
	expect(fs.statSync(helper).mode & 0o777).toBe(fs.statSync(previousInode).mode & 0o777);
	expect(fs.readFileSync(path.join(src, 'PreviouslyMigrated.tsrx'), 'utf8')).toBe(provider);
	expect((await runCodemod([src], { root, strong: true })).files.filter((f) => f.changed)).toEqual(
		[],
	);

	const server = await bundleRuntime(
		root,
		'server',
		`export {PreviouslyMigrated} from './src/PreviouslyMigrated.tsrx';
		export {Greeting} from './src/Greeting.tsrx';
		export {createElement as h} from 'octane/server'; export {prerender} from 'octane/static';`,
		['react-intl'],
	);
	const rendered = await server.prerender(() =>
		server.h(server.PreviouslyMigrated, { children: server.h(server.Greeting, { name: 'Ada' }) }),
	);
	expect(rendered.html).toContain('Hello, Ada!');
});

it.each(['edited', 'symlink'])(
	'leaves a prior %s helper and its caller untouched',
	async (kind) => {
		const { src, helper, input } = project();
		const custom = previous + '\n// project customization\n';
		if (kind === 'edited') fs.writeFileSync(helper, custom);
		else {
			const external = path.join(root, 'original-helper');
			fs.writeFileSync(external, previous);
			fs.symlinkSync(external, helper);
		}
		const out = await runCodemod([input], { root });
		expect(out.files.flatMap((f) => f.notes)).toContainEqual(
			expect.objectContaining({
				severity: 'error',
				message: expect.stringContaining('already in use'),
			}),
		);
		expect(fs.lstatSync(helper).isSymbolicLink()).toBe(kind === 'symlink');
		expect(fs.readFileSync(helper, 'utf8')).toBe(kind === 'edited' ? custom : previous);
		expect(fs.readFileSync(input, 'utf8')).toBe(page);
		expect(fs.existsSync(path.join(src, 'Greeting.tsrx'))).toBe(false);
	},
);

it.each([
	['an identical upgrade', current, true],
	['a concurrent edit', '// mine\n', false],
])('rechecks the target before publishing over %s', async (_, other, accepted) => {
	const { src, helper, input } = project();
	fs.writeFileSync(helper, previous);
	const mkdtemp = fs.mkdtempSync;
	vi.spyOn(fs, 'mkdtempSync').mockImplementation((prefix, ...args) => {
		if (path.dirname(prefix) === src) fs.writeFileSync(helper, other);
		return mkdtemp(prefix, ...args);
	});
	const out = await runCodemod([input], { root });
	expect(out.files.some((f) => f.notes.some((n) => n.severity === 'error'))).toBe(!accepted);
	expect(fs.readFileSync(helper, 'utf8')).toBe(other);
	expect(fs.existsSync(input)).toBe(!accepted);
	expect(fs.existsSync(path.join(src, 'Greeting.tsrx'))).toBe(accepted);
	expect(fs.readdirSync(src).filter((f) => f.startsWith('.octane-'))).toEqual([]);
});

it('adopts an identical concurrent creation without truncating its file', async () => {
	const { helper, input } = project();
	const write = fs.writeFileSync;
	vi.spyOn(fs, 'writeFileSync').mockImplementation((name, data, opts) => {
		if (name === helper && !fs.existsSync(name)) {
			write(helper, current, { flag: 'wx', mode: 0o600 });
		}
		return write(name, data, opts);
	});
	const out = await runCodemod([input], { root });
	expect(out.files.flatMap((f) => f.notes).filter((n) => n.severity === 'error')).toEqual([]);
	expect(fs.readFileSync(helper, 'utf8')).toBe(current);
	expect(fs.existsSync(input)).toBe(false);
});

it('retains the prior helper and can retry an interrupted atomic replacement', async () => {
	const { helper, input, src } = project();
	fs.writeFileSync(helper, previous);
	const rename = fs.renameSync;
	const busy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
		if (to === helper) throw new Error('replace interrupted');
		return rename(from, to);
	});
	await expect(runCodemod([input], { root })).rejects.toThrow('replace interrupted');
	expect(fs.readFileSync(helper, 'utf8')).toBe(previous);
	expect(fs.readFileSync(input, 'utf8')).toBe(page);
	expect(fs.readdirSync(src).filter((f) => f.startsWith('.octane-'))).toEqual([]);
	busy.mockRestore();
	await runCodemod([input], { root });
	expect(fs.readFileSync(helper, 'utf8')).toBe(current);
	expect(fs.existsSync(path.join(src, 'Greeting.tsrx'))).toBe(true);
});
