import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { octane } from '../src/index.js';

const repositoryRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const profilerGlobal = '__OCTANE_PROFILER__';
const componentId = '/src/ProfileBundleProbe.tsrx#ProfileBundleProbe';

function write(root: string, relativePath: string, content: string) {
	const file = join(root, relativePath);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
	return file;
}

describe('Vite production profiling specialization', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'octane-vite-profile-build-'));
		write(root, 'package.json', '{"name":"profile-fixture","private":true,"type":"module"}\n');
		const octanePackage = join(root, 'node_modules/octane');
		mkdirSync(dirname(octanePackage), { recursive: true });
		symlinkSync(join(repositoryRoot, 'packages/octane'), octanePackage, 'dir');
		write(
			root,
			'src/ProfileBundleProbe.tsrx',
			`import { memo, useState } from 'octane';

const Leaf = memo(function Leaf(props: { value: number }) {
	return <span>{props.value as string}</span>;
});

export function ProfileBundleProbe() @{
	const [count] = useState(0);
	<Leaf value={count} />
}
`,
		);
		write(
			root,
			'src/index.js',
			`import { ProfileBundleProbe } from './ProfileBundleProbe.tsrx';

export { ProfileBundleProbe };
`,
		);
	});

	afterEach(() => {
		Reflect.deleteProperty(globalThis, profilerGlobal);
		rmSync(root, { recursive: true, force: true });
	});

	async function bundle(profile: boolean) {
		const mode = profile ? 'profile' : 'normal';
		const outputDirectory = join(root, `dist-${mode}`);
		await build({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [octane({ hmr: false, profile })],
			build: {
				outDir: outputDirectory,
				emptyOutDir: true,
				minify: true,
				target: 'esnext',
				lib: {
					entry: join(root, 'src/index.js'),
					formats: ['es'],
					fileName: 'bundle',
				},
			},
		});
		const file = join(outputDirectory, 'bundle.js');
		return { code: readFileSync(file, 'utf8'), file };
	}

	it('erases profiling from normal builds and installs it in profile builds', async () => {
		const normal = await bundle(false);
		const profiled = await bundle(true);

		expect(normal.code).not.toContain(profilerGlobal);
		expect(normal.code).not.toContain(componentId);
		expect(profiled.code).toContain('__OCTANE_PROFILER__');
		expect(profiled.code).toContain(componentId);

		const normalModule = await import(`${pathToFileURL(normal.file).href}?normal`);
		expect(normalModule.ProfileBundleProbe).toBeTypeOf('function');
		expect((globalThis as any)[profilerGlobal]).toBeUndefined();

		const profiledModule = await import(`${pathToFileURL(profiled.file).href}?profile`);
		expect(profiledModule.ProfileBundleProbe).toBeTypeOf('function');
		const profiler = (globalThis as any)[profilerGlobal];
		expect(profiler).toMatchObject({
			start: expect.any(Function),
			getEvents: expect.any(Function),
			exportTrace: expect.any(Function),
		});
	}, 30_000);
});
