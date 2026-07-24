import { OctaneDevtoolsEventClient, type WireTreeNode } from './client';

interface RuntimeHook {
	version: number;
	getTree(): WireTreeNode[];
	inspect(id: number): {
		id: number;
		name: string;
		hooks: Array<{ kind: string; value: unknown }>;
		context: Array<{ name: string; value: unknown }>;
		effectCount: number;
	} | null;
	subscribe(listener: () => void): () => void;
}

function getHook(): RuntimeHook | undefined {
	return (globalThis as unknown as { __OCTANE_DEVTOOLS__?: RuntimeHook }).__OCTANE_DEVTOOLS__;
}

/**
 * Wire the runtime hook to the event bus. Emits a coalesced `tree` snapshot once
 * per scheduler flush; answers `inspect-request` with `inspect` (lazy detail — only
 * the selected node is serialized). Returns a stop function. No-op if the runtime
 * devtools hook is not installed (e.g. a non-profile build).
 */
export function startBridge(client: OctaneDevtoolsEventClient = new OctaneDevtoolsEventClient()): () => void {
	const hook = getHook();
	if (!hook) return () => {};

	// Coalesce: the runtime may fire several times synchronously; emit one tree
	// per microtask tick.
	let scheduled = false;
	const emitTree = () => {
		scheduled = false;
		client.emit('tree', { nodes: hook.getTree() });
	};
	const offFlush = hook.subscribe(() => {
		if (scheduled) return;
		scheduled = true;
		queueMicrotask(emitTree);
	});

	const offRequest = client.on('inspect-request', (e) => {
		const detail = hook.inspect(e.payload.id);
		if (detail) client.emit('inspect', detail);
	});

	// Emit an initial snapshot so a panel opened after mount sees the tree.
	client.emit('tree', { nodes: hook.getTree() });

	return () => {
		offFlush();
		offRequest();
	};
}
