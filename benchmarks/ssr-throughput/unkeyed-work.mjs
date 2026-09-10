// Opt-in production SSR work gate for positional descriptor children.
// Run from the repository root:
//   EXPECT_IMPLICIT_JSON=1000 node benchmarks/ssr-throughput/unkeyed-work.mjs 2
//   EXPECT_IMPLICIT_JSON=0 EXPECTED_HTML_SHA=YOUR_BASELINE_SHA node benchmarks/ssr-throughput/unkeyed-work.mjs 2
// `dist/unkeyed-work` is ignored and separate from the regular suite's build.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, 'fixtures');
const output = path.join(here, 'dist', 'unkeyed-work');
const seconds = Math.max(0.2, Number(process.argv[2] ?? 2));

await build({
	root: fixture,
	logLevel: 'warn',
	build: { ssr: 'src/entry-unkeyed-server.ts', outDir: output, emptyOutDir: true },
	ssr: { noExternal: ['@tsrx/react'] },
});

const { renderUnkeyedDescriptors: render } = await import(
	pathToFileURL(path.join(output, 'entry-unkeyed-server.js')).href
);
const first = await render();
const second = await render();
assert.equal(second.html, first.html, 'repeated SSR output');
assert.equal(second.css, first.css, 'repeated CSS output');
assert.equal(first.css, '', 'fixture does not produce CSS');

const ids = [...first.html.matchAll(/<li data-index="([^"]+)">/g)].map((match) => match[1]);
assert.equal(ids.length, 1001, 'rendered rows');
assert.deepEqual(ids, ['0', 'explicit', ...Array.from({ length: 999 }, (_, i) => String(i + 1))]);
assert.equal((first.html.match(/<!--\[/g) ?? []).length > 1000, true, 'hydratable rows');

const htmlSha = createHash('sha256').update(first.html).digest('hex');
if (process.env.EXPECTED_HTML_SHA) {
	assert.equal(htmlSha, process.env.EXPECTED_HTML_SHA, 'baseline/candidate HTML bytes');
}

// Keep the observer out of all timing and memory measurements. Its shape
// excludes unrelated serialization and checks that instrumentation did not
// alter the public response.
let implicitJson = 0;
let explicitJson = 0;
const originalStringify = JSON.stringify;
let observed;
try {
	JSON.stringify = function (value, ...args) {
		if (Array.isArray(value) && value.length === 3 && Array.isArray(value[0])) {
			if (value[0].length === 0 && value[1] === 'index' && Number.isInteger(value[2])) {
				implicitJson++;
			} else if (value[0].length === 0 && value[1] === 'key' && value[2] === '0') {
				explicitJson++;
			}
		}
		return Reflect.apply(originalStringify, this, [value, ...args]);
	};
	observed = await render();
} finally {
	JSON.stringify = originalStringify;
}
assert.equal(observed.html, first.html, 'observed HTML bytes');
assert.equal(observed.css, first.css, 'observed CSS bytes');
assert.equal(explicitJson, 1, 'explicit key control');
assert.equal(implicitJson, Number(process.env.EXPECT_IMPLICIT_JSON ?? 0), 'implicit key work');

const now = () => process.hrtime.bigint();
const warmEnd = now() + 350_000_000n;
let warmRenders = 0;
while (warmRenders < 3 || now() < warmEnd) {
	Buffer.byteLength((await render()).html);
	warmRenders++;
}
const samples = [];
const end = now() + BigInt(Math.round(seconds * 1e9));
do {
	const start = now();
	Buffer.byteLength((await render()).html);
	samples.push(Number(now() - start) / 1e6);
} while (now() < end);
samples.sort((a, b) => a - b);
const medianMs = samples[Math.floor(samples.length / 2)];
const p95Ms = samples[Math.floor(samples.length * 0.95)];
const result = {
	htmlSha,
	htmlBytes: Buffer.byteLength(first.html),
	rows: ids.length,
	implicitJson,
	explicitJson,
	warmRenders,
	samples: samples.length,
	medianMs,
	p95Ms,
};
if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(result, null, 2) + '\n');
}
console.log(result);
