// Observe rest-parameter construction in the emitted production trampoline.
// No probes are inserted into Octane or its child bodies.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import ts from 'typescript';

const root = fileURLToPath(new URL('./', import.meta.url));
const distRoot = fileURLToPath(new URL('./dist/', import.meta.url));
const bundleFile = fileURLToPath(new URL('./dist/assets/main.js', import.meta.url));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const measureOnly = process.argv.includes('--measure');

async function main() {
	await build({
		entryPoints: [fileURLToPath(new URL('./main.js', import.meta.url))],
		outfile: bundleFile,
		bundle: true,
		format: 'esm',
		platform: 'browser',
		target: 'esnext',
		minify: false,
		define: { 'process.env.NODE_ENV': '"production"' },
		absWorkingDir: root,
	});
	const source = readFileSync(bundleFile, 'utf8');
	const ast = ts.createSourceFile('production.js', source, ts.ScriptTarget.Latest, true);
	let trampoline;
	function findTrampoline(node) {
		if (ts.isFunctionDeclaration(node) && node.name?.text === 'hostComponent') {
			function visit(child) {
				if (
					ts.isBinaryExpression(child) &&
					child.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
					ts.isPropertyAccessExpression(child.left) &&
					child.left.name.text === 'body'
				) {
					let value = child.right;
					while (ts.isParenthesizedExpression(value)) value = value.expression;
					if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
						assert.equal(trampoline, undefined, 'one host child trampoline');
						trampoline = value;
					}
				}
				ts.forEachChild(child, visit);
			}
			visit(node);
		}
		ts.forEachChild(node, findTrampoline);
	}
	findTrampoline(ast);
	assert.ok(trampoline, 'live production bundle contains the host child trampoline');
	const restParameters = trampoline.parameters.filter(
		(parameter) => parameter.dotDotDotToken,
	).length;
	const trampolineBody = trampoline.body.getStart(ast);
	const trampolineHash = sha256(source.slice(trampoline.getStart(ast), trampoline.end));

	const server = createServer((request, response) => {
		if (request.url === '/assets/main.js') {
			response.setHeader('content-type', 'text/javascript');
			response.end(source);
		} else if (request.url === '/') {
			response.setHeader('content-type', 'text/html');
			response.end(
				'<!doctype html><div id="main"></div><script type="module" src="/assets/main.js"></script>',
			);
		} else {
			response.statusCode = 404;
			response.end();
		}
	});
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			server.removeListener('error', reject);
			resolve();
		});
	});
	const url = `http://127.0.0.1:${server.address().port}/`;

	async function invoke(page, name, arg) {
		await page.evaluate(({ name, arg }) => window[name](arg), { name, arg });
	}

	async function observe(browser, mode, count, operation) {
		const context = await browser.newContext();
		try {
			const page = await context.newPage();
			const errors = [];
			page.on('pageerror', (error) => errors.push(error.message));
			page.on('console', (message) => {
				if (message.type() === 'error') errors.push(message.text());
			});
			const cdp = await context.newCDPSession(page);
			await cdp.send('Profiler.enable');
			await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
			await page.goto(url);
			await page.waitForFunction(() => window.__ready === true);
			if (operation !== 'mount') {
				await invoke(page, '__mount', { mode, count });
				await invoke(page, '__verify');
			}
			await cdp.send('Profiler.takePreciseCoverage');
			await invoke(page, `__${operation}`, operation === 'mount' ? { mode, count } : undefined);
			const coverage = await cdp.send('Profiler.takePreciseCoverage');
			let trampolineCalls = 0;
			let hostCalls = 0;
			let productionCalls = 0;
			for (const script of coverage.result) {
				if (script.url !== url + 'assets/main.js') continue;
				const candidates = [];
				for (const fn of script.functions) {
					const range = fn.ranges[0];
					productionCalls += range.count;
					if (fn.functionName === 'hostComponent') hostCalls += range.count;
					if (
						range.startOffset >= trampoline.getStart(ast) &&
						range.endOffset <= trampoline.end &&
						range.startOffset <= trampolineBody &&
						trampolineBody < range.endOffset
					) {
						candidates.push(range);
					}
				}
				candidates.sort((a, b) => a.endOffset - a.startOffset - (b.endOffset - b.startOffset));
				if (candidates.length > 0) {
					const range = candidates[0];
					trampolineCalls += range.count;
				}
			}
			assert.ok(productionCalls > 0, 'operation has live production coverage');
			if (operation !== 'unmount') {
				await invoke(page, '__verify');
				await invoke(page, '__unmount');
			}
			assert.deepEqual(errors, [], 'production browser errors');
			const passes = operation === 'unmount' ? 0 : operation === 'updateBatch' ? 12 : 1;
			assert.equal(
				trampolineCalls,
				mode === 'function' ? count * passes : 0,
				'child work cardinality',
			);
			assert.equal(
				hostCalls,
				count * passes * (mode === 'function' ? 2 : 1),
				'host work cardinality',
			);
			return { hostCalls, trampolineCalls, restArrays: trampolineCalls * restParameters };
		} finally {
			await context.close();
		}
	}

	let browser;
	try {
		browser = await chromium.launch({
			headless: true,
			args: ['--no-sandbox', '--js-flags=--jitless'],
		});
		const results = {};
		for (const count of [128, 1024]) {
			for (const mode of ['function', 'value']) {
				for (const operation of ['mount', 'update', 'updateBatch', 'unmount']) {
					results[`${mode}_${count}_${operation}`] = await observe(browser, mode, count, operation);
				}
			}
		}
		const payload = {
			suite: 'host-component',
			node: process.version,
			browser: browser.version(),
			runtimeHash: sha256(
				readFileSync(new URL('../../packages/octane/src/runtime.ts', import.meta.url)),
			),
			bundleHash: sha256(source),
			bundleBytes: Buffer.byteLength(source),
			trampolineHash,
			restParameters,
			results,
		};
		console.log(JSON.stringify(payload, null, 2));
		if (process.env.BENCH_JSON)
			writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, 2) + '\n');
		if (!measureOnly)
			assert.equal(restParameters, 0, 'host child forwarding avoids a rest-parameter array');
	} finally {
		try {
			await browser?.close();
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	}
}

try {
	await main();
} finally {
	rmSync(distRoot, { recursive: true, force: true });
}
