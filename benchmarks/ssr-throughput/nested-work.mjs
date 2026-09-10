// Opt-in SSR nested-key work gate. Observed and timed production modules load
// in separate processes; the JSON observer is installed before module loading.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = path.dirname(fileURLToPath(import.meta.url));
const seconds = Math.max(0, Number(process.argv[2] ?? 2));
const kinds = ['nested', 'flat', 'explicit'];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const worker = process.argv.find((arg) => arg.startsWith('--worker='))?.slice(9);

function checkResponse(kind, first, second) {
	assert.equal(second.html, first.html, `${kind}: repeated HTML`);
	assert.equal(second.css, first.css, `${kind}: repeated CSS`);
	assert.equal(first.css, '', `${kind}: fixture has no styles`);
	const ids = [...first.html.matchAll(/<li data-index="([^"]+)">/g)].map((match) => match[1]);
	assert.deepEqual(ids, ['0', 'explicit', ...Array.from({ length: 999 }, (_, i) => String(i + 1))]);
	return {
		rows: ids.length,
		htmlSha: hash(first.html),
		cssSha: hash(first.css),
		htmlBytes: Buffer.byteLength(first.html),
		cssBytes: Buffer.byteLength(first.css),
	};
}

async function runWorker() {
	const counts = {
		nestedImplicitJson: 0,
		nestedExplicitJson: 0,
		flatImplicitJson: 0,
		flatExplicitJson: 0,
		pathOnlyJson: 0,
	};
	const original = JSON.stringify;
	try {
		if (worker === 'observe') {
			JSON.stringify = function (value, ...args) {
				if (Array.isArray(value) && value.length === 3 && Array.isArray(value[0])) {
					if (value[1] === 'index' && Number.isInteger(value[2])) {
						counts[value[0].length === 0 ? 'flatImplicitJson' : 'nestedImplicitJson']++;
					} else if (value[1] === 'key') {
						counts[value[0].length === 0 ? 'flatExplicitJson' : 'nestedExplicitJson']++;
					}
				} else if (
					Array.isArray(value) &&
					value.length === 2 &&
					value[0] === 'wrapper' &&
					value[1] === 0
				) {
					counts.pathOnlyJson++;
				}
				return Reflect.apply(original, this, [value, ...args]);
			};
		}
		const { renderNestedDescriptors: render } = await import(
			pathToFileURL(process.env.NESTED_WORK_BUNDLE).href
		);
		const result = {};
		for (const kind of kinds) {
			const first = await render(kind);
			for (const key of Object.keys(counts)) counts[key] = 0;
			const second = await render(kind);
			result[kind] = { ...checkResponse(kind, first, second) };
			if (worker === 'observe') {
				result[kind].work = { ...counts };
				continue;
			}
			if (seconds === 0) continue;
			const now = () => process.hrtime.bigint();
			const warmEnd = now() + 350_000_000n;
			let warmRenders = 0;
			while (warmRenders < 3 || now() < warmEnd) {
				Buffer.byteLength((await render(kind)).html);
				warmRenders++;
			}
			const samples = [];
			const end = now() + BigInt(Math.round(seconds * 1e9));
			do {
				const start = now();
				Buffer.byteLength((await render(kind)).html);
				samples.push(Number(now() - start) / 1e6);
			} while (now() < end);
			samples.sort((a, b) => a - b);
			result[kind].timing = {
				warmRenders,
				samples: samples.length,
				medianMs: samples[Math.floor(samples.length / 2)],
				p95Ms: samples[Math.floor(samples.length * 0.95)],
			};
		}
		return result;
	} finally {
		JSON.stringify = original;
	}
}

if (worker !== undefined) {
	assert.ok(worker === 'observe' || worker === 'clean', 'known worker mode');
	console.log(JSON.stringify(await runWorker()));
} else {
	const label = process.env.NESTED_BUILD_LABEL ?? 'candidate';
	assert.match(label, /^[a-zA-Z0-9-]+$/, 'build label is a directory suffix');
	const output = path.join(here, 'dist', `nested-work-${label}`);
	const bundle = path.join(output, 'entry-nested-server.js');
	if (!process.argv.includes('--no-build')) {
		const { build } = await import('vite');
		await build({
			root: path.join(here, 'fixtures'),
			logLevel: 'warn',
			build: {
				ssr: 'src/entry-nested-server.ts',
				outDir: output,
				emptyOutDir: true,
				minify: 'esbuild',
			},
			ssr: { noExternal: ['@tsrx/react'] },
		});
	}
	const source = fs.readFileSync(bundle);
	const meta = {
		node: process.version,
		label,
		bundleSha: hash(source),
		bundleBytes: source.length,
		bundleGzipBytes: gzipSync(source).length,
	};
	if (process.argv.includes('--build-only')) {
		console.log(JSON.stringify(meta, null, 2));
	} else {
		const run = (kind) =>
			JSON.parse(
				execFileSync(
					process.execPath,
					[fileURLToPath(import.meta.url), String(seconds), `--worker=${kind}`],
					{
						env: { ...process.env, NESTED_WORK_BUNDLE: bundle },
						encoding: 'utf8',
					},
				),
			);
		const observed = run('observe');
		const clean = run('clean');
		for (const kind of kinds) {
			const { work, ...response } = observed[kind];
			const { timing, ...cleanResponse } = clean[kind];
			assert.deepEqual(response, cleanResponse, `${kind}: observer preserves all response bytes`);
			assert.equal(work.flatImplicitJson, 0, `${kind}: top-level implicit keys stay numeric`);
		}
		assert.deepEqual(
			observed.flat.work,
			{
				nestedImplicitJson: 0,
				nestedExplicitJson: 0,
				flatImplicitJson: 0,
				flatExplicitJson: 1,
				pathOnlyJson: 0,
			},
			'flat control',
		);
		assert.deepEqual(
			observed.explicit.work,
			{
				nestedImplicitJson: 0,
				nestedExplicitJson: 1001,
				flatImplicitJson: 0,
				flatExplicitJson: 0,
				pathOnlyJson: 0,
			},
			'fully explicit control',
		);
		assert.deepEqual(
			observed.nested.work,
			{
				nestedImplicitJson: Number(process.env.EXPECT_NESTED_IMPLICIT_JSON ?? 0),
				nestedExplicitJson: 1,
				flatImplicitJson: 0,
				flatExplicitJson: 0,
				pathOnlyJson: Number(process.env.EXPECT_NESTED_PATH_JSON ?? 1),
			},
			'nested implicit identity work',
		);
		const responses = Object.fromEntries(
			kinds.map((kind) => [kind, { htmlSha: clean[kind].htmlSha, cssSha: clean[kind].cssSha }]),
		);
		const responseSha = hash(JSON.stringify(responses));
		if (process.env.EXPECTED_RESPONSE_SHA)
			assert.equal(
				responseSha,
				process.env.EXPECTED_RESPONSE_SHA,
				'baseline/candidate HTML and CSS bytes',
			);
		const result = { ...meta, responseSha, observed, clean };
		if (process.env.BENCH_JSON)
			fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(result, null, 2) + '\n');
		console.log(JSON.stringify(result, null, 2));
	}
}
