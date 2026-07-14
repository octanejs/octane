import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { octane } from '../src/index.js';

const repositoryRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const profilerGlobal = '__OCTANE_PROFILER__';
const runGlobal = '__octane_profile_bundle_runs__';

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
			`import { hmr, lazy, memo, useState } from 'octane';

const MemoLeaf = memo(function MemoLeaf(props: { value: number }) {
	return <span>{props.value as string}</span>;
});
const HotLeaf = hmr(MemoLeaf);
const LazyLeaf = lazy(async () => ({ default: MemoLeaf }));

export function ProfileBundleProbe() @{
	const [count] = useState(0);
	<>
		<HotLeaf value={count} />
		<LazyLeaf value={count} />
	</>
}
`,
		);
		write(
			root,
			'src/index.js',
			`import { ProfileBundleProbe } from './ProfileBundleProbe.tsrx';

globalThis.${runGlobal} = (globalThis.${runGlobal} || 0) + 1;
export { ProfileBundleProbe };
`,
		);
	});

	afterEach(() => {
		Reflect.deleteProperty(globalThis, profilerGlobal);
		Reflect.deleteProperty(globalThis, runGlobal);
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

	it('erases the recorder from normal bundles and executes profiled metadata', async () => {
		const normal = await bundle(false);
		const profiled = await bundle(true);

		for (const marker of [
			'__OCTANE_PROFILER__',
			'__OCTANE_PROFILE_ENABLED__',
			'__profileComponent',
			'__profileComponentSource',
			'__profileHook',
			'__profileResolveHook',
			'__profileSource',
			'getEvents',
			'exportTrace',
			'traceEvents',
			'Octane profiler bufferSize',
			'Components',
			'octane.component',
			'component-render',
			'component-bailout',
			'/src/ProfileBundleProbe.tsrx#ProfileBundleProbe',
		]) {
			expect(normal.code, `normal bundle retained ${marker}`).not.toContain(marker);
		}

		expect(profiled.code).not.toContain('__OCTANE_PROFILE_ENABLED__');
		expect(profiled.code).toContain('__OCTANE_PROFILER__');
		expect(profiled.code).toContain('exportTrace');
		expect(profiled.code).toContain('Components');
		expect(profiled.code).toContain('octane.component');
		expect(profiled.code).toContain('component-render');
		expect(profiled.code).toContain('/src/ProfileBundleProbe.tsrx#ProfileBundleProbe');
		expect(profiled.code.length).toBeGreaterThan(normal.code.length);

		await import(`${pathToFileURL(normal.file).href}?normal`);
		expect((globalThis as any)[runGlobal]).toBe(1);
		expect((globalThis as any)[profilerGlobal]).toBeUndefined();

		await import(`${pathToFileURL(profiled.file).href}?profile`);
		expect((globalThis as any)[runGlobal]).toBe(2);
		const profiler = (globalThis as any)[profilerGlobal];
		expect(profiler).toMatchObject({
			start: expect.any(Function),
			getEvents: expect.any(Function),
			exportTrace: expect.any(Function),
		});
		expect(profiler.getEvents()).toEqual([]);
		expect(profiler.exportTrace()).toMatchObject({ displayTimeUnit: 'ms', traceEvents: [] });
	}, 30_000);
});
