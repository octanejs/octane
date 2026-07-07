import { it } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { RouterProvider } from '@octanejs/router';
import { makeLifecycleRouter, createDeferred, setThrow } from '../_fixtures/lifecycle.tsrx';

async function flush() {
	for (let i = 0; i < 6; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

function armDomTraps() {
	Error.stackTraceLimit = 220;
	const origRemove = Node.prototype.removeChild;
	const origInsert = Node.prototype.insertBefore;
	(Node.prototype as any).removeChild = function (child: Node) {
		try {
			return origRemove.call(this, child);
		} catch (e) {
			console.log('REMOVECHILD THREW. child:', (child as any).nodeName, 'stack:');
			console.log((new Error('trap').stack || '').split('\n').slice(1, 40).join('\n'));
			throw e;
		}
	};
	(Node.prototype as any).insertBefore = function (node: Node, ref: Node | null) {
		try {
			return origInsert.call(this, node, ref);
		} catch (e) {
			const el = this as Element;
			console.log(
				'INSERTBEFORE THREW.',
				'parent:',
				el.nodeName,
				(el as any).className ?? '',
				'connected:',
				(el as any).isConnected,
				'childCount:',
				el.childNodes.length,
				'| ref:',
				ref ? ref.nodeName + '(' + ((ref as any).data ?? '') + ')' : null,
				'refParent:',
				ref?.parentNode ? (ref.parentNode as Element).nodeName + '.' + ((ref.parentNode as any).className ?? '') : null,
				'refParentConnected:',
				ref?.parentNode ? (ref.parentNode as any).isConnected : null,
			);
			console.log((new Error('trap').stack || '').split('\n').slice(1, 220).join('\n'));
			throw e;
		}
	};
}

it('probe: global boundary with trap', async () => {
	armDomTraps();
	setThrow(true);
	const router = makeLifecycleRouter('/boom', { routeError: false });
	await router.load();
	const r = mount(RouterProvider as any, { router });
	await flush();
	console.log('GLOBAL:', JSON.stringify(r.container.textContent));
	r.unmount();
});

it('probe: loader pending with trap', async () => {
	const deferred = createDeferred<string>();
	const router = makeLifecycleRouter('/', { deferred });
	await router.load();
	const r = mount(RouterProvider as any, { router });
	await flush();
	router.navigate({ to: '/slow-loader' });
	await flush();
	deferred.resolve('data');
	await flush();
	console.log('AFTER:', JSON.stringify(r.container.textContent));
	r.unmount();
});
