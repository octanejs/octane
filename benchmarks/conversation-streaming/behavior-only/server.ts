import { createElement, earlySignalBootstrapScript, renderToReadableStream } from 'octane/server';
import { retireSignalOwnerIdentity, runWithSignalOwner } from 'octane/signals';
import { releaseAuthorization, traceResponse } from '../fixture/src/backend.ts';
import { requests } from './context.ts';
import { draft$ } from './State.ts';
import { Shell } from './Shell.tsrx';

export { earlySignalBootstrapScript };
export function diagnostics(request: Request) {
	const context = { request } as Parameters<typeof traceResponse>[0];
	return new URL(request.url).pathname === '/release'
		? releaseAuthorization(context)
		: traceResponse(context);
}
export async function render(request: Request, clientEntry: string) {
	const owner = { scopeKey: 'octane:document' };
	const streamedSignals = {
		buildId: 'behavior-benchmark-v1',
		documentId: new URL(request.url).searchParams.get('run')!,
	};
	return requests.run({ request, owner }, async () => {
		runWithSignalOwner(owner, () => draft$.set('from server'));
		const stream = await renderToReadableStream(createElement(Shell), {
			signalOwner: owner,
			streamedSignals,
			earlySignalBootstrap: 'external',
			// The browser intentionally holds authorization while testing interaction.
			timeoutMs: 30_000,
			signal: request.signal,
			onError: (error: unknown) => console.error('Behavior-only SSR:', error),
		});
		const reader = stream.getReader();
		const encode = (text: string) => new TextEncoder().encode(text);
		const metadata = JSON.stringify(streamedSignals)
			.replace(/</g, '\\u003c')
			.replace(/\u2028/g, '\\u2028')
			.replace(/\u2029/g, '\\u2029');
		return new ReadableStream<Uint8Array>({
			async start(controller) {
				try {
					controller.enqueue(
						encode(
							'<!doctype html><html><head><meta charset="utf-8"><title>Behavior-only benchmark</title>' +
								earlySignalBootstrapScript() +
								'</head><body>',
						),
					);
					// The first renderer chunk includes the accepted shell native seeds and
					// query selection authority. The launcher precedes auth-dependent EOF.
					const shell = await reader.read();
					if (shell.done) throw new Error('Missing SSR shell');
					controller.enqueue(shell.value);
					controller.enqueue(
						encode(
							'<script id="behavior-identity" type="application/json">' +
								metadata +
								'</script><script>import(' +
								JSON.stringify(clientEntry) +
								').catch(e=>{document.documentElement.dataset.bootstrapError=String(e)})</script>',
						),
					);
					for (;;) {
						const next = await reader.read();
						if (next.done) break;
						controller.enqueue(next.value);
					}
					controller.enqueue(encode('</body></html>'));
					controller.close();
				} catch (error) {
					controller.error(error);
				} finally {
					retireSignalOwnerIdentity(owner);
				}
			},
			cancel(reason) {
				return reader.cancel(reason);
			},
		});
	});
}
