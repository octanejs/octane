// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MessageChannel } from 'node:worker_threads';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile.js';

async function consume(body: string, dev: boolean) {
	const filename = resolve(import.meta.dirname, '_fixtures/deferred-template-children.tsrx');
	const authored = await readFile(filename, 'utf8');
	const result = await build({
		stdin: {
			contents: compile(
				authored +
					`\nimport {createRoot,flushSync,createElement,act} from 'octane';
import {load} from 'octane/hydration';
export async function run(host) { ${body} }`,
				filename,
				{ dev, hmr: false },
			).code,
			resolveDir: resolve(import.meta.dirname, '_fixtures'),
			loader: 'js',
		},
		plugins: [
			{
				name: 'authored-hydrate-query',
				setup(build) {
					build.onResolve({ filter: /\?octane-hydrate=/ }, (args) => ({
						path: resolve(args.resolveDir, args.path),
						namespace: 'authored-hydrate-query',
					}));
					build.onLoad({ filter: /.*/, namespace: 'authored-hydrate-query' }, (args) => ({
						contents: compile(authored, args.path, { dev, hmr: false }).code,
						loader: 'js',
						resolveDir: resolve(import.meta.dirname, '_fixtures'),
					}));
				},
			},
		],
		bundle: true,
		write: false,
		format: 'iife',
		globalName: '__DEFERRED_CONSUMER__',
		platform: 'browser',
		target: 'esnext',
		define: {
			'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
	});
	const window = new Window({ settings: { enableJavaScriptEvaluation: true } });
	window.document.body.innerHTML = '<div id="host"></div>';
	// Happy DOM lacks this browser task transport. Use real Node ports for act
	// checkpoints, and close the realm's passive scheduler port after the consumer.
	const channels: MessageChannel[] = [];
	class ConsumerMessageChannel extends MessageChannel {
		constructor() {
			super();
			channels.push(this);
		}
	}
	(window as unknown as { MessageChannel: typeof MessageChannel }).MessageChannel =
		ConsumerMessageChannel;
	try {
		window.eval(result.outputFiles[0].text);
		return JSON.parse(
			JSON.stringify(
				await (window as any).__DEFERRED_CONSUMER__.run(window.document.querySelector('#host')),
			),
		);
	} finally {
		for (const channel of channels) {
			channel.port1.close();
			channel.port2.close();
		}
		window.close();
	}
}

describe('production deferred template consumers', () => {
	it('owns an empty pending arm and retries its ready child without exposing an enclosing fallback', async () => {
		const body = `let release; const pending=new Promise(r=>release=r);
const root=createRoot(host); root.render(ClientPendingBoundary,{when:load(),pending,label:'ready'});
await act(()=>{}); const parked={outer:host.querySelector('#outer-pending')!==null,child:host.querySelector('#template-editor')!==null};
await act(()=>release()); const ready=host.querySelector('#template-action').textContent;
root.unmount(); return {parked,ready,cleaned:host.childNodes.length===0};`;
		for (const dev of [false, true])
			expect(await consume(body, dev)).toEqual({
				parked: { outer: false, child: false },
				ready: 'ready:0',
				cleaned: true,
			});
	});

	it('preserves explicit and spread fallback output before the deferred child is ready', async () => {
		const body = `const results=[];
for(const View of [ExplicitFallbackBoundary,SpreadBoundary]) {
 let release; const pending=new Promise(r=>release=r);
 const fallback=createElement('p',{id:'authored-pending',children:'Authored pending'});
 const root=createRoot(host); root.render(View,{when:load(),pending,label:'ready',fallback,boundary:{when:load(),fallback}});
 await act(()=>{}); const parked=host.querySelector('#authored-pending')?.textContent ?? null;
 await act(()=>release()); const ready=host.querySelector('#template-action').textContent;
 root.unmount(); results.push({parked,ready,cleaned:host.childNodes.length===0});
} return results;`;
		for (const dev of [false, true])
			expect(await consume(body, dev)).toEqual([
				{ parked: 'Authored pending', ready: 'ready:0', cleaned: true },
				{ parked: 'Authored pending', ready: 'ready:0', cleaned: true },
			]);
	});

	it('preserves descriptor children and shadowed value-returning component output', async () => {
		const body = `const root=createRoot(host); root.render(DescriptorBoundary,{when:load(),children:createElement('article',{children:'descriptor'})});
await act(()=>{}); const descriptor=host.querySelector('article').textContent;
flushSync(()=>root.render(ShadowBoundary,{Hydrate:()=> 'shadowed'})); const shadow=host.textContent;
root.unmount(); return {descriptor,shadow,cleaned:host.childNodes.length===0};`;
		for (const dev of [false, true])
			expect(await consume(body, dev)).toEqual({
				descriptor: 'descriptor',
				shadow: 'shadowed',
				cleaned: true,
			});
	});
});
