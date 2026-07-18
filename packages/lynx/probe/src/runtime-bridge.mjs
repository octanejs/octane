import { createPhase0PAPIAdapter } from './papi.mjs';
import {
	createPhase0BackgroundProbe,
	createPhase0MainThreadReceiver,
	PHASE_0_PROTOCOL,
} from './protocol.mjs';

const BATCH_MESSAGE = 'octane-lynx-phase-0:batch';
const ACK_MESSAGE = 'octane-lynx-phase-0:ack';

function sendContextMessage(context, data) {
	if (typeof context.postMessage === 'function') {
		context.postMessage(data);
		return;
	}
	if (typeof context.dispatchEvent === 'function') {
		context.dispatchEvent({ type: 'message', data });
		return;
	}
	throw new Error('Octane Lynx Phase 0 requires a cross-thread message context.');
}

function addContextListener(context, listener) {
	if (typeof context.addEventListener !== 'function') {
		throw new Error('Octane Lynx Phase 0 requires context.addEventListener().');
	}
	context.addEventListener('message', listener);
	return () => context.removeEventListener?.('message', listener);
}

export function installPhase0MainThread(target = globalThis) {
	const context = target.lynx?.getJSContext?.();
	if (!context) {
		throw new Error('Octane Lynx Phase 0 requires lynx.getJSContext() on the main thread.');
	}

	const papi = createPhase0PAPIAdapter(target);
	const receiver = createPhase0MainThreadReceiver(papi);
	const removeMessageListener = addContextListener(context, (event) => {
		const message = event?.data;
		if (message?.type !== BATCH_MESSAGE) return;

		try {
			const acknowledgement = receiver.receive(message.batch);
			sendContextMessage(context, {
				type: ACK_MESSAGE,
				acknowledgement,
			});
		} catch (error) {
			sendContextMessage(context, {
				type: ACK_MESSAGE,
				rejection: {
					...PHASE_0_PROTOCOL,
					type: 'reject',
					version: message.batch?.version,
					message: error instanceof Error ? error.message : String(error),
				},
			});
		}
	});

	return Object.freeze({
		papi,
		receiver,
		destroy() {
			removeMessageListener();
		},
	});
}

export function installPhase0Background(target = globalThis) {
	const context = target.lynx?.getCoreContext?.();
	if (!context) {
		throw new Error('Octane Lynx Phase 0 requires lynx.getCoreContext() in the background.');
	}

	const pending = new Map();
	const removeMessageListener = addContextListener(context, (event) => {
		const message = event?.data;
		if (message?.type !== ACK_MESSAGE) return;

		const version = message.acknowledgement?.acceptedVersion ?? message.rejection?.version;
		const deferred = pending.get(version);
		if (!deferred) return;
		pending.delete(version);
		if (message.rejection) {
			deferred.reject(new Error(message.rejection.message));
		} else {
			deferred.resolve(message.acknowledgement);
		}
	});

	const probe = createPhase0BackgroundProbe((batch) => {
		return new Promise((resolve, reject) => {
			pending.set(batch.version, { resolve, reject });
			sendContextMessage(context, {
				type: BATCH_MESSAGE,
				batch,
			});
		});
	});

	let lastEvent = Promise.resolve();
	function deliverNativeEvent(listenerId, event) {
		lastEvent = probe.handleNativeEvent(listenerId, event);
		return lastEvent;
	}

	const ready = probe.mount();
	let destroyOperation;
	return Object.freeze({
		probe,
		ready,
		deliverNativeEvent,
		get lastEvent() {
			return lastEvent;
		},
		destroy() {
			if (destroyOperation !== undefined) return destroyOperation;
			destroyOperation = probe.destroy().finally(() => {
				removeMessageListener();
				for (const deferred of pending.values()) {
					deferred.reject(new Error('Octane Lynx Phase 0 background transport was destroyed.'));
				}
				pending.clear();
			});
			return destroyOperation;
		},
	});
}
