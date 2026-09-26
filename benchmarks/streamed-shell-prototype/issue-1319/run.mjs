import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build } = await import(pathToFileURL(require.resolve('esbuild')).href);
const { createOctaneCompiler } = await import(
	pathToFileURL(require.resolve('octane/compiler/bundler')).href
);
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-1319-starts-'));
const compiler = createOctaneCompiler({
	root: repo,
	environment: 'server',
	dev: false,
	hmr: false,
});

// These two bodies read the same independent handles. The second hides them
// behind a property access that the existing start proof does not traverse.
const cases = [
	{ name: 'direct', reads: 'const a = a$.get(); const b = b$.get();' },
	{
		name: 'property',
		reads: 'const pair = { a$, b$ }; const a = pair.a$.get(); const b = pair.b$.get();',
	},
];
const driver = `
import { renderToPipeableStream } from 'octane/server';
import { Shell } from 'experiment-fixture';

export async function run() {
  const started = [], controls = {}, promises = {}, chunks = [], errors = [];
  let finish;
  const finished = new Promise(resolve => { finish = resolve; });
  const stream = renderToPipeableStream(Shell, {
    load(name) {
      started.push(name);
      return promises[name] ??= new Promise(resolve => { controls[name] = resolve; });
    },
  }, { onError(error) { errors.push(String(error)); } });
  stream.pipe({ write(chunk) { chunks.push(String(chunk)); return true; }, end() { finish(); } });
  async function until(test) {
    const deadline = Date.now() + 5000;
    while (!test()) {
      if (Date.now() >= deadline) throw new Error('Timed out waiting for stream: ' + JSON.stringify({ started, errors }));
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }
  try {
    await until(() => started.length > 0 && chunks.join('').includes('<i>waiting</i>'));
    const initiallyStarted = [...started];
    controls.a('A');
    await until(() => started.includes('b'));
    controls.b('B');
    await until(() => chunks.join('').includes('<p>AB</p>'));
    let timer;
    await Promise.race([
      finished,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Stream did not finish')), 5000); }),
    ]).finally(() => clearTimeout(timer));
    return { initiallyStarted, allStarts: started, renderedValue: 'AB', errors };
  } finally {
    stream.abort();
  }
}
`;

const results = [];
for (const sample of cases) {
	const source = `import { query$ } from 'octane/signals';
function Content(props) @{
  const a$ = query$(() => 'a', () => props.load('a'));
  const b$ = query$(() => 'b', () => props.load('b'));
  ${sample.reads}
  <p>{String(a) + String(b)}</p>
}
export function Shell(props) @{
  @try { <Content load={props.load} /> } @pending { <i>waiting</i> }
}`;
	const sourceId = path.join(import.meta.dirname, `${sample.name}.tsrx`);
	const code = compiler.transform(source, sourceId).code;
	const bundle = path.join(output, `${sample.name}.mjs`);
	await build({
		stdin: { contents: driver, resolveDir: repo, loader: 'js', sourcefile: 'driver.js' },
		outfile: bundle,
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'es2022',
		plugins: [
			{
				name: 'server-fixture',
				setup(builder) {
					builder.onResolve({ filter: /^experiment-fixture$/ }, () => ({
						path: 'experiment-fixture',
						namespace: 'experiment',
					}));
					builder.onLoad({ filter: /.*/, namespace: 'experiment' }, () => ({
						contents: code,
						loader: 'js',
						resolveDir: repo,
					}));
					builder.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => ({
						path: require.resolve(request === 'octane' ? 'octane/server' : request),
					}));
				},
			},
		],
	});
	const result = await (await import(pathToFileURL(bundle).href)).run();
	assert.deepEqual(result.initiallyStarted, sample.name === 'direct' ? ['a', 'b'] : ['a']);
	assert.deepEqual(result.allStarts, ['a', 'b']);
	assert.deepEqual(result.errors, []);
	results.push({ case: sample.name, ...result });
}

console.log(JSON.stringify({ output, node: process.version, results }, null, 2));
