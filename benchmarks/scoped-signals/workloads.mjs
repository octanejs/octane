import assert from 'node:assert/strict';

export const GRAPH_SHAPES = ['independent', 'fanout', 'chain', 'diamond', 'dynamic'];

export function scopedAdapter({ createScope }) {
	return {
		name: 'octane-scoped',
		create: (key) => createScope({ scopeKey: key }),
		signal$: (owner, key, initial) => owner.signal$(key, initial),
		derived$: (owner, key, read) => owner.derived$(key, read),
		read$: (owner, value$) => owner.get(value$),
		write: (owner, value$, value) => owner.set(value$, value),
		batch: (owner, run) => owner.batch(run),
		subscribe: (owner, value$, report) => value$.subscribe(() => report(owner.get(value$))),
		dispose: (owner) => owner.dispose(),
	};
}

// Alien exposes effect disposal, not scope retirement of writable handles.
// This baseline supplies only the explicit list of stops an imperative owner
// needs. It does not imitate Octane's epochs, request state, or retained values.
export function alienAdapter({ signal, computed, effect, startBatch, endBatch }) {
	return {
		name: 'alien-3.2.0',
		create: () => new Set(),
		signal$: (_owner, _key, initial) => signal(initial),
		derived$: (_owner, _key, read) => computed(read),
		read$: (_owner, value$) => value$(),
		write: (_owner, value$, value) => value$(value),
		batch: (_owner, run) => {
			startBatch();
			try {
				return run();
			} finally {
				endBatch();
			}
		},
		subscribe(owner, value$, report) {
			let initialized = false;
			const stop = effect(() => {
				const value = value$();
				if (initialized) report(value);
				initialized = true;
			});
			owner.add(stop);
			return () => {
				if (owner.delete(stop)) stop();
			};
		},
		dispose(owner) {
			for (const stop of owner) stop();
			owner.clear();
		},
	};
}

/**
 * Both adapters execute this exact graph and interaction sequence. Every
 * computation uses finite integers, where Object.is and Alien's !== agree.
 * Initializing each derived node as it is created avoids making a recursive
 * cold read of a deep chain the accidental benchmark for graph construction.
 */
export function createGraph(adapter, shape, size, key) {
	assert.ok(GRAPH_SHAPES.includes(shape), `unknown graph shape: ${shape}`);
	assert.ok(Number.isSafeInteger(size) && size > 0, 'graph size must be positive');
	const owner = adapter.create(key);
	const sources = [];
	const outputs = [];
	const observed = [];
	const model = {
		value: 0,
		alternate: 100,
		branch: false,
		rows: shape === 'independent' ? Array(size).fill(0) : null,
	};
	let nodes = 0;
	let notifications = 0;
	let invalidObservation;
	let disposed = false;
	let batching = false;
	let sampled;
	let sampledExpected;

	function source$(name, initial) {
		nodes++;
		return adapter.signal$(owner, name, initial);
	}
	function derive$(name, read) {
		nodes++;
		const value$ = adapter.derived$(owner, name, read);
		adapter.read$(owner, value$);
		return value$;
	}
	function expected(index) {
		switch (shape) {
			case 'independent':
				return model.rows[index] + index;
			case 'fanout':
				return model.value + index;
			case 'chain':
				return model.value + size;
			case 'diamond':
				return model.value * 2;
			case 'dynamic':
				return (model.branch ? model.alternate : model.value) + index;
		}
	}

	try {
		if (shape === 'independent') {
			for (let index = 0; index < size; index++) {
				const input$ = source$(`input-${index}`, 0);
				sources.push(input$);
				outputs.push(derive$(`output-${index}`, () => adapter.read$(owner, input$) + index));
			}
		} else {
			const input$ = source$('input', 0);
			sources.push(input$);
			if (shape === 'chain') {
				let previous$ = input$;
				for (let index = 0; index < size; index++) {
					const upstream$ = previous$;
					previous$ = derive$(`link-${index}`, () => adapter.read$(owner, upstream$) + 1);
				}
				outputs.push(previous$);
			} else if (shape === 'diamond') {
				for (let index = 0; index < size; index++) {
					const left$ = derive$(`left-${index}`, () => adapter.read$(owner, input$) + index + 1);
					const right$ = derive$(`right-${index}`, () => adapter.read$(owner, input$) - index - 1);
					outputs.push(
						derive$(
							`sum-${index}`,
							() => adapter.read$(owner, left$) + adapter.read$(owner, right$),
						),
					);
				}
			} else if (shape === 'dynamic') {
				const alternate$ = source$('alternate', model.alternate);
				const branch$ = source$('branch', false);
				sources.push(alternate$, branch$);
				for (let index = 0; index < size; index++) {
					outputs.push(
						derive$(
							`selected-${index}`,
							() =>
								adapter.read$(owner, adapter.read$(owner, branch$) ? alternate$ : input$) + index,
						),
					);
				}
			} else {
				for (let index = 0; index < size; index++) {
					outputs.push(derive$(`output-${index}`, () => adapter.read$(owner, input$) + index));
				}
			}
		}
		for (let index = 0; index < outputs.length; index++) {
			observed.push(adapter.read$(owner, outputs[index]));
			adapter.subscribe(owner, outputs[index], (value) => {
				notifications++;
				observed[index] = value;
				if (value !== expected(index) || disposed || batching) {
					invalidObservation ??= { index, value, expected: expected(index), disposed, batching };
				}
			});
		}
	} catch (error) {
		adapter.dispose(owner);
		throw error;
	}

	function writeValue(value, index = 0) {
		if (shape === 'independent') {
			model.rows[index] = value;
			adapter.write(owner, sources[index], value);
		} else if (shape === 'dynamic' && model.branch) {
			model.alternate = value;
			adapter.write(owner, sources[1], value);
		} else {
			model.value = value;
			adapter.write(owner, sources[0], value);
		}
	}

	return {
		shape,
		size,
		nodes,
		outputs: outputs.length,
		operations: [
			'read_cached',
			'write_sparse',
			'batch_write_all',
			'write_equal',
			...(shape === 'dynamic' ? ['switch_dependency'] : []),
		],
		step(operation, version) {
			switch (operation) {
				case 'read_cached': {
					const index = version % outputs.length;
					sampled = adapter.read$(owner, outputs[index]);
					sampledExpected = expected(index);
					break;
				}
				case 'write_sparse':
					writeValue(version, version % size);
					break;
				case 'batch_write_all':
					adapter.batch(owner, () => {
						batching = true;
						try {
							if (shape === 'independent') {
								for (let index = 0; index < size; index++) writeValue(version, index);
							} else {
								writeValue(version - 1);
								writeValue(version);
							}
						} finally {
							batching = false;
						}
					});
					break;
				case 'write_equal':
					if (shape === 'independent') {
						const index = version % size;
						writeValue(model.rows[index], index);
					} else writeValue(model.branch ? model.alternate : model.value);
					break;
				case 'switch_dependency': {
					assert.equal(shape, 'dynamic');
					model.branch = !model.branch;
					adapter.write(owner, sources[2], model.branch);
					// A write to the now inactive dependency must leave every displayed
					// value intact; its cost reveals whether obsolete edges were removed.
					if (model.branch) {
						model.value = version;
						adapter.write(owner, sources[0], version);
					} else {
						model.alternate = version;
						adapter.write(owner, sources[1], version);
					}
					break;
				}
				default:
					throw new Error(`unknown operation: ${operation}`);
			}
		},
		verify() {
			assert.equal(sampled, sampledExpected, `${shape} returned an incorrect cached read`);
			assert.equal(
				invalidObservation,
				undefined,
				`${adapter.name}/${shape}: incoherent notification ${JSON.stringify(invalidObservation)}`,
			);
			for (let index = 0; index < outputs.length; index++) {
				assert.equal(
					adapter.read$(owner, outputs[index]),
					expected(index),
					`${shape} value ${index}`,
				);
				assert.equal(observed[index], expected(index), `${shape} missed notification ${index}`);
			}
		},
		get notifications() {
			return notifications;
		},
		dispose() {
			disposed = true;
			adapter.dispose(owner);
		},
	};
}

/** One uninterrupted owner lifetime; checkpoints must not create a new realm. */
export async function continuousDisposal(
	adapter,
	{
		cycles,
		width = 32,
		unrelated = 0,
		checkpoint = async () => undefined,
		key = 'continuous',
		measure = false,
	},
) {
	assert.ok(Number.isSafeInteger(cycles) && cycles > 0);
	assert.ok(Number.isSafeInteger(width) && width > 0);
	assert.ok(Number.isSafeInteger(unrelated) && unrelated >= 0);
	const shared = adapter.create(`${key}/shared`);
	const input$ = adapter.signal$(shared, 'input', 0);
	const unrelatedOwners = [];
	let current = 0;
	let lateNotifications = 0;
	let disposedOwners = 0;
	let operationMilliseconds = 0;
	const checkpoints = new Set([0, Math.min(100, cycles), cycles]);
	function perform(run) {
		if (!measure) return run();
		const started = performance.now();
		try {
			return run();
		} finally {
			operationMilliseconds += performance.now() - started;
		}
	}

	function consumer(suffix) {
		const owner = adapter.create(`${key}/${suffix}`);
		const observed = [];
		let active = true;
		let notifications = 0;
		try {
			for (let index = 0; index < width; index++) {
				const value$ = adapter.derived$(
					owner,
					`value-${index}`,
					() => adapter.read$(shared, input$) + index,
				);
				observed.push(adapter.read$(owner, value$));
				adapter.subscribe(owner, value$, (value) => {
					if (!active) lateNotifications++;
					notifications++;
					observed[index] = value;
				});
			}
		} catch (error) {
			active = false;
			adapter.dispose(owner);
			throw error;
		}
		return {
			verify() {
				for (let index = 0; index < width; index++) {
					assert.equal(observed[index], current + index, 'shared consumer missed an update');
				}
			},
			get notifications() {
				return notifications;
			},
			dispose() {
				if (active) disposedOwners++;
				active = false;
				adapter.dispose(owner);
			},
		};
	}

	function runCycle(cycle) {
		let first;
		let second;
		try {
			perform(() => {
				first = consumer(`${cycle}/first`);
				second = consumer(`${cycle}/second`);
			});
			perform(() => adapter.write(shared, input$, ++current));
			first.verify();
			second.verify();
			perform(() => first.dispose());
			const beforeFirst = first.notifications;
			perform(() => adapter.write(shared, input$, ++current));
			assert.equal(first.notifications, beforeFirst, 'disposed consumer received an update');
			second.verify();
			perform(() => second.dispose());
			const beforeSecond = second.notifications;
			perform(() => adapter.write(shared, input$, ++current));
			assert.equal(second.notifications, beforeSecond, 'last disposed consumer received an update');
			assert.equal(
				adapter.read$(shared, input$),
				current,
				'consumer disposal retired its shared source',
			);
			assert.equal(lateNotifications, 0, 'a previous cycle retained a live consumer');
		} finally {
			// Repeat retirement to exercise its idempotence outside measurement.
			first?.dispose();
			second?.dispose();
		}
	}

	try {
		for (let index = 0; index < unrelated; index++) {
			const owner = adapter.create(`${key}/unrelated-${index}`);
			unrelatedOwners.push(owner);
			const input$ = adapter.signal$(owner, 'input', index);
			const value$ = adapter.derived$(owner, 'value', () => adapter.read$(owner, input$) + 1);
			adapter.read$(owner, value$);
			adapter.subscribe(owner, value$, () => {
				throw new Error('an unrelated graph was notified');
			});
		}
		await checkpoint({ cycle: 0, disposedOwners, lateNotifications });
		for (let cycle = 1; cycle <= cycles; cycle++) {
			// Let every local owner/consumer handle leave the stack before a heap
			// checkpoint. The harness retains only scalar results across cycles.
			runCycle(cycle);
			if (checkpoints.has(cycle)) {
				await checkpoint({ cycle, disposedOwners, lateNotifications });
			}
		}
		return {
			cycles,
			width,
			unrelated,
			lateNotifications,
			finalValue: current,
			...(measure ? { operationMilliseconds } : {}),
		};
	} finally {
		for (const owner of unrelatedOwners) adapter.dispose(owner);
		adapter.dispose(shared);
	}
}
