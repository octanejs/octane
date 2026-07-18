export const PHASE_0_PROTOCOL = Object.freeze({
	protocolVersion: 1,
	rendererId: 'lynx',
	rootId: 'octane-lynx-phase-0',
});

export const PHASE_0_HOST_IDS = Object.freeze({
	page: 'page',
	counter: 'counter',
	label: 'label',
	value: 'value',
});

export const PHASE_0_LISTENER_ID = 'octane-lynx-phase-0:counter:tap';

const COMMAND_TYPES = new Set(['append', 'create', 'dataset', 'event', 'remove', 'text']);
const HOST_TYPES = new Set(['raw-text', 'text', 'view']);

function invariant(condition, message) {
	if (!condition) {
		throw new Error(`Octane Lynx Phase 0 protocol: ${message}`);
	}
}

function assertProtocolIdentity(message, label) {
	invariant(message !== null && typeof message === 'object', `${label} must be an object.`);
	for (const [key, expected] of Object.entries(PHASE_0_PROTOCOL)) {
		invariant(message[key] === expected, `${label}.${key} must be ${JSON.stringify(expected)}.`);
	}
}

function forgetSubtree(rootId, knownHosts, parents) {
	const pending = [rootId];
	const forgotten = new Set();
	while (pending.length > 0) {
		const id = pending.pop();
		if (forgotten.has(id)) continue;
		forgotten.add(id);
		for (const [childId, parentId] of parents) {
			if (parentId === id) pending.push(childId);
		}
	}
	for (const id of forgotten) {
		parents.delete(id);
		knownHosts.delete(id);
	}
}

export function createPhase0BackgroundProbe(send) {
	invariant(typeof send === 'function', 'background send must be a function.');

	let acceptedVersion = 0;
	let count = 0;
	let destroyOperation;
	let destroyed = false;
	let fault;
	let mountOperation;
	let mounted = false;
	let tail = Promise.resolve();

	async function commit(commands) {
		invariant(!destroyed, 'cannot commit after destroy.');
		invariant(fault === undefined, 'cannot commit after a transport fault.');

		const version = acceptedVersion + 1;
		const batch = {
			...PHASE_0_PROTOCOL,
			type: 'commit',
			version,
			commands,
		};

		let acknowledgement;
		try {
			acknowledgement = await send(batch);
			assertProtocolIdentity(acknowledgement, 'acknowledgement');
			invariant(acknowledgement.type === 'ack', 'transport response must be an acknowledgement.');
			invariant(
				acknowledgement.acceptedVersion === version,
				`acknowledgement accepted version must be ${version}.`,
			);
		} catch (error) {
			fault = error;
			throw error;
		}

		acceptedVersion = version;
		return acknowledgement;
	}

	function enqueue(createCommands, onAcknowledged) {
		const operation = tail.then(async () => {
			const acknowledgement = await commit(createCommands());
			onAcknowledged?.();
			return acknowledgement;
		});
		tail = operation.catch(() => {});
		return operation;
	}

	function mount() {
		invariant(mountOperation === undefined, 'mount may only run once.');
		invariant(destroyOperation === undefined, 'cannot mount after destroy was requested.');
		mountOperation = enqueue(
			() => [
				{
					type: 'create',
					id: PHASE_0_HOST_IDS.counter,
					hostType: 'view',
					parentId: PHASE_0_HOST_IDS.page,
				},
				{
					type: 'dataset',
					id: PHASE_0_HOST_IDS.counter,
					name: 'testid',
					value: 'phase-0-counter',
				},
				{
					type: 'event',
					id: PHASE_0_HOST_IDS.counter,
					eventType: 'bindEvent',
					eventName: 'tap',
					listenerId: PHASE_0_LISTENER_ID,
				},
				{
					type: 'create',
					id: PHASE_0_HOST_IDS.label,
					hostType: 'text',
					parentId: PHASE_0_HOST_IDS.counter,
				},
				{
					type: 'create',
					id: PHASE_0_HOST_IDS.value,
					hostType: 'raw-text',
					parentId: PHASE_0_HOST_IDS.label,
					text: 'Count: 0',
				},
				{
					type: 'append',
					parentId: PHASE_0_HOST_IDS.label,
					childId: PHASE_0_HOST_IDS.value,
				},
				{
					type: 'append',
					parentId: PHASE_0_HOST_IDS.counter,
					childId: PHASE_0_HOST_IDS.label,
				},
				{
					type: 'append',
					parentId: PHASE_0_HOST_IDS.page,
					childId: PHASE_0_HOST_IDS.counter,
				},
			],
			() => {
				mounted = true;
			},
		);
		return mountOperation;
	}

	async function handleNativeEvent(listenerId, event) {
		invariant(
			!destroyed && destroyOperation === undefined,
			'cannot deliver an event after destroy.',
		);
		invariant(mounted, 'cannot deliver an event before mount acknowledgement.');
		invariant(listenerId === PHASE_0_LISTENER_ID, 'received a stale or foreign listener ID.');
		invariant(event?.eventName === 'tap', 'counter listener only accepts the native tap event.');

		let nextCount;
		return enqueue(
			() => {
				nextCount = count + 1;
				return [
					{
						type: 'text',
						id: PHASE_0_HOST_IDS.value,
						value: `Count: ${nextCount}`,
					},
				];
			},
			() => {
				count = nextCount;
			},
		);
	}

	function destroy() {
		if (destroyOperation !== undefined) return destroyOperation;
		destroyOperation = (async () => {
			if (mountOperation === undefined) return;
			try {
				await mountOperation;
			} catch {
				return;
			}
			await enqueue(
				() => [
					{
						type: 'event',
						id: PHASE_0_HOST_IDS.counter,
						eventType: 'bindEvent',
						eventName: 'tap',
						listenerId: undefined,
					},
					{
						type: 'remove',
						parentId: PHASE_0_HOST_IDS.page,
						childId: PHASE_0_HOST_IDS.counter,
					},
				],
				() => {
					mounted = false;
				},
			);
		})().finally(() => {
			destroyed = true;
		});
		return destroyOperation;
	}

	return Object.freeze({
		destroy,
		handleNativeEvent,
		mount,
		get acceptedVersion() {
			return acceptedVersion;
		},
		get count() {
			return count;
		},
		get destroyed() {
			return destroyed;
		},
		get fault() {
			return fault;
		},
	});
}

function validateCommand(command, knownHosts, parents) {
	invariant(command !== null && typeof command === 'object', 'each command must be an object.');
	invariant(
		COMMAND_TYPES.has(command.type),
		`unsupported command ${JSON.stringify(command.type)}.`,
	);

	if (command.type === 'create') {
		invariant(typeof command.id === 'string' && command.id.length > 0, 'create.id is required.');
		invariant(!knownHosts.has(command.id), `host ${JSON.stringify(command.id)} already exists.`);
		invariant(
			HOST_TYPES.has(command.hostType),
			`unsupported host type ${JSON.stringify(command.hostType)}.`,
		);
		invariant(
			knownHosts.has(command.parentId),
			`create parent ${JSON.stringify(command.parentId)} is missing.`,
		);
		if (command.hostType === 'raw-text') {
			invariant(typeof command.text === 'string', 'raw-text creation requires a string value.');
		}
		knownHosts.set(command.id, true);
		return;
	}

	if (command.type === 'append') {
		invariant(
			knownHosts.has(command.parentId),
			`append parent ${JSON.stringify(command.parentId)} is missing.`,
		);
		invariant(
			knownHosts.has(command.childId),
			`append child ${JSON.stringify(command.childId)} is missing.`,
		);
		invariant(command.childId !== PHASE_0_HOST_IDS.page, 'append cannot move the protocol root.');
		let ancestorId = command.parentId;
		while (ancestorId !== undefined) {
			invariant(
				ancestorId !== command.childId,
				`append would create a cycle through ${JSON.stringify(command.childId)}.`,
			);
			ancestorId = parents.get(ancestorId);
		}
		parents.set(command.childId, command.parentId);
		return;
	}

	if (command.type === 'remove') {
		invariant(
			knownHosts.has(command.parentId),
			`remove parent ${JSON.stringify(command.parentId)} is missing.`,
		);
		invariant(
			knownHosts.has(command.childId),
			`remove child ${JSON.stringify(command.childId)} is missing.`,
		);
		invariant(
			parents.get(command.childId) === command.parentId,
			`host ${JSON.stringify(command.childId)} is not attached to ${JSON.stringify(command.parentId)}.`,
		);
		forgetSubtree(command.childId, knownHosts, parents);
		return;
	}

	invariant(
		knownHosts.has(command.id),
		`${command.type} host ${JSON.stringify(command.id)} is missing.`,
	);
	if (command.type === 'dataset') {
		invariant(
			typeof command.name === 'string' && command.name.length > 0,
			'dataset.name is required.',
		);
		invariant(typeof command.value === 'string', 'dataset.value must be a string.');
	} else if (command.type === 'event') {
		invariant(typeof command.eventType === 'string', 'event.eventType is required.');
		invariant(typeof command.eventName === 'string', 'event.eventName is required.');
		invariant(
			command.listenerId === undefined || typeof command.listenerId === 'string',
			'event.listenerId must be a string or undefined.',
		);
	} else if (command.type === 'text') {
		invariant(typeof command.value === 'string', 'text.value must be a string.');
	}
}

export function createPhase0MainThreadReceiver(papi) {
	invariant(papi !== null && typeof papi === 'object', 'main-thread PAPI adapter is required.');

	const hosts = new Map([[PHASE_0_HOST_IDS.page, papi.page]]);
	const parents = new Map();
	let acceptedVersion = 0;

	function receive(batch) {
		assertProtocolIdentity(batch, 'batch');
		invariant(batch.type === 'commit', 'message must be a commit batch.');
		invariant(
			batch.version === acceptedVersion + 1,
			`batch version must be ${acceptedVersion + 1}, received ${JSON.stringify(batch.version)}.`,
		);
		invariant(Array.isArray(batch.commands), 'batch.commands must be an array.');

		const stagedHosts = new Map([...hosts].map(([id]) => [id, true]));
		const stagedParents = new Map(parents);
		for (const command of batch.commands) {
			validateCommand(command, stagedHosts, stagedParents);
		}

		for (const command of batch.commands) {
			if (command.type === 'create') {
				const parent = hosts.get(command.parentId);
				hosts.set(command.id, papi.create(command.hostType, parent, command.text));
			} else if (command.type === 'append') {
				papi.append(hosts.get(command.parentId), hosts.get(command.childId));
				parents.set(command.childId, command.parentId);
			} else if (command.type === 'dataset') {
				papi.setDataset(hosts.get(command.id), command.name, command.value);
			} else if (command.type === 'event') {
				papi.setEvent(
					hosts.get(command.id),
					command.eventType,
					command.eventName,
					command.listenerId,
				);
			} else if (command.type === 'text') {
				papi.setText(hosts.get(command.id), command.value);
			} else if (command.type === 'remove') {
				papi.remove(hosts.get(command.parentId), hosts.get(command.childId));
				forgetSubtree(command.childId, hosts, parents);
			}
		}

		papi.flush();
		acceptedVersion = batch.version;

		return Object.freeze({
			...PHASE_0_PROTOCOL,
			type: 'ack',
			acceptedVersion,
		});
	}

	return Object.freeze({
		receive,
		getHost(id) {
			return hosts.get(id);
		},
		get acceptedVersion() {
			return acceptedVersion;
		},
	});
}
