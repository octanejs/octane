import type { UniversalSerializableValue } from 'octane/universal/native';

/** Compiler-inaccessible native attribute used by the public selector-query API. */
export const LYNX_NODES_REF_ATTRIBUTE = 'octane-ref';

/** Build the immutable selector installed for one root/host generation. */
export function createLynxNodesRefSelector(root: number, id: number, generation: number): string {
	positiveSafeInteger(root, 'selector root');
	positiveSafeInteger(id, 'selector id');
	positiveSafeInteger(generation, 'selector generation');
	return `[${LYNX_NODES_REF_ATTRIBUTE}="r${root}-h${id}-g${generation}"]`;
}

/** Immutable native identity captured by one background query handle. */
export interface LynxNodesRefIdentity {
	readonly root: number;
	readonly id: number;
	readonly type: string;
	readonly generation: number;
	readonly selector: string;
}

/** Current client-driver state for the captured identity. */
export interface LynxNodesRefState extends LynxNodesRefIdentity {
	readonly active: boolean;
	/** Monotonic identity for the currently attached physical cell. */
	readonly attachmentEpoch: number;
}

export type LynxNodesRefErrorCode = 'inactive' | 'native' | 'stale';

export class LynxNodesRefError extends Error {
	readonly code: LynxNodesRefErrorCode;
	readonly nativeCode: number | null;
	readonly data: UniversalSerializableValue;

	constructor(
		code: LynxNodesRefErrorCode,
		message: string,
		nativeCode: number | null = null,
		data: UniversalSerializableValue = undefined,
	) {
		super(message);
		this.name = 'LynxNodesRefError';
		this.code = code;
		this.nativeCode = nativeCode;
		this.data = data;
	}
}

export interface LynxNativeQueryTask {
	exec(): void;
}

export interface LynxNativeInvokeOptions {
	readonly method: string;
	readonly params?: Readonly<Record<string, UniversalSerializableValue>>;
	readonly success: (value: unknown) => void;
	readonly fail: (value: unknown) => void;
}

export interface LynxNativeNodesRef {
	invoke(options: LynxNativeInvokeOptions): LynxNativeQueryTask;
	fields(
		fields: Readonly<Record<string, boolean>>,
		callback: (value: unknown, status: unknown) => void,
	): LynxNativeQueryTask;
	path(callback: (value: unknown, status: unknown) => void): LynxNativeQueryTask;
	setNativeProps(props: Readonly<Record<string, UniversalSerializableValue>>): LynxNativeQueryTask;
}

export interface LynxNativeSelectorQuery {
	select(selector: string): LynxNativeNodesRef;
}

export type LynxCreateSelectorQuery = () => LynxNativeSelectorQuery;

export interface LynxNodesRefFieldsOptions {
	readonly id?: boolean;
	readonly dataset?: boolean;
	readonly tag?: boolean;
	readonly unique_id?: boolean;
	readonly index?: boolean;
	readonly class?: boolean;
	readonly attribute?: boolean;
	/** Returning a live SelectorQuery would violate the Octane handle boundary. */
	readonly query?: false;
}

export type LynxNodesRefFieldsResult = Readonly<Record<string, UniversalSerializableValue>> | null;

export interface LynxNodesRefPathEntry {
	readonly tag: string;
	readonly id: string;
	readonly class: readonly string[];
	readonly dataSet: Readonly<Record<string, UniversalSerializableValue>>;
	readonly index: number;
}

export interface LynxNodesRefPathResult {
	readonly data: readonly LynxNodesRefPathEntry[];
}

export interface LynxMeasureOptions {
	readonly relativeTo?: 'screen' | string | null;
	readonly androidEnableTransformProps?: boolean;
	readonly iOSEnableAnimationProps?: boolean;
}

export interface LynxMeasureResult {
	readonly id: string;
	readonly dataset: Readonly<Record<string, UniversalSerializableValue>>;
	readonly left: number;
	readonly right: number;
	readonly top: number;
	readonly bottom: number;
	readonly width: number;
	readonly height: number;
}

export interface LynxNodesRef {
	readonly root: number;
	readonly id: number;
	readonly type: string;
	readonly generation: number;
	readonly active: boolean;
	invoke<Result extends UniversalSerializableValue = UniversalSerializableValue>(
		method: string,
		params?: Readonly<Record<string, UniversalSerializableValue>>,
	): Promise<Result>;
	measure(options?: LynxMeasureOptions): Promise<LynxMeasureResult>;
	fields(options: LynxNodesRefFieldsOptions): Promise<LynxNodesRefFieldsResult>;
	path(): Promise<LynxNodesRefPathResult | null>;
	/** Resolves once Lynx accepts the selector-query submission, not after layout. */
	setNativeProps(props: Readonly<Record<string, UniversalSerializableValue>>): Promise<void>;
}

export interface CreateLynxNodesRefOptions {
	readonly identity: LynxNodesRefIdentity;
	readonly createSelectorQuery: LynxCreateSelectorQuery;
	/** The client driver must return the currently published state for this handle. */
	readonly readState: () => LynxNodesRefState | null;
}

/**
 * The client driver owns permanent invalidation because a pull-only state read
 * cannot settle a native operation whose callback never arrives.
 */
export interface LynxNodesRefBinding {
	readonly handle: LynxNodesRef;
	/** Reject work owned by a detached cell without invalidating the logical handle. */
	invalidateAttachment(): void;
	invalidate(reason?: unknown): void;
}

interface PendingOperation {
	reject(error: Error): void;
}

type OperationOutcome<Value> =
	{ readonly ok: true; readonly value: Value } | { readonly ok: false; readonly error: Error };

const FIELD_NAMES = new Set([
	'id',
	'dataset',
	'tag',
	'unique_id',
	'index',
	'class',
	'attribute',
	'query',
]);

function normalizedError(value: unknown, fallback: string): Error {
	if (value instanceof Error) return value;
	return new Error(value === undefined ? fallback : String(value));
}

function positiveSafeInteger(value: unknown, label: string): asserts value is number {
	if (!Number.isSafeInteger(value) || (value as number) <= 0) {
		throw new TypeError(`Octane Lynx NodesRef ${label} must be a positive safe integer.`);
	}
}

function nonNegativeSafeInteger(value: unknown, label: string): asserts value is number {
	if (!Number.isSafeInteger(value) || (value as number) < 0) {
		throw new TypeError(`Octane Lynx NodesRef ${label} must be a non-negative safe integer.`);
	}
}

function nonEmptyString(value: unknown, label: string): asserts value is string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new TypeError(`Octane Lynx NodesRef ${label} must be a non-empty string.`);
	}
}

function cloneSerializable(
	value: unknown,
	label: string,
	seen: Set<object> = new Set(),
): UniversalSerializableValue {
	if (
		value === null ||
		value === undefined ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'bigint' ||
		typeof value === 'boolean'
	) {
		return value;
	}
	if (typeof value !== 'object') {
		throw new TypeError(`Octane Lynx NodesRef ${label} contains a non-serializable value.`);
	}
	if (Object.getOwnPropertySymbols(value).length !== 0) {
		throw new TypeError(`Octane Lynx NodesRef ${label} contains symbol fields.`);
	}
	if (seen.has(value)) {
		throw new TypeError(`Octane Lynx NodesRef ${label} contains a cycle.`);
	}
	seen.add(value);
	try {
		if (Array.isArray(value)) {
			return Object.freeze(
				value.map((entry, index) => cloneSerializable(entry, `${label}[${index}]`, seen)),
			);
		}
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) {
			throw new TypeError(`Octane Lynx NodesRef ${label} requires arrays or plain objects.`);
		}
		const output: Record<string, UniversalSerializableValue> = {};
		for (const [name, entry] of Object.entries(value)) {
			Object.defineProperty(output, name, {
				configurable: true,
				enumerable: true,
				value: cloneSerializable(entry, `${label}.${name}`, seen),
				writable: true,
			});
		}
		return Object.freeze(output);
	} finally {
		seen.delete(value);
	}
}

function cloneRecord(
	value: unknown,
	label: string,
): Readonly<Record<string, UniversalSerializableValue>> {
	const clone = cloneSerializable(value, label);
	if (clone === null || typeof clone !== 'object' || Array.isArray(clone)) {
		throw new TypeError(`Octane Lynx NodesRef ${label} must be a plain object.`);
	}
	return clone as Readonly<Record<string, UniversalSerializableValue>>;
}

function nativeStatus(
	value: unknown,
	label: string,
): { code: number; data: UniversalSerializableValue } {
	const status = cloneRecord(value, label);
	if (!Number.isSafeInteger(status.code)) {
		throw new TypeError(`Octane Lynx NodesRef ${label}.code must be a safe integer.`);
	}
	return { code: status.code as number, data: status.data };
}

function nativeFailure(value: unknown, label: string): Error {
	let status;
	try {
		status = nativeStatus(value, label);
	} catch (error) {
		return normalizedError(error, `Octane Lynx NodesRef received an invalid ${label}.`);
	}
	return new LynxNodesRefError(
		'native',
		`Octane Lynx NodesRef ${label} failed with native code ${status.code}.`,
		status.code,
		status.data,
	);
}

function validateFieldsOptions(
	value: LynxNodesRefFieldsOptions,
): Readonly<Record<string, boolean>> {
	const fields = cloneRecord(value, 'fields options');
	for (const [name, enabled] of Object.entries(fields)) {
		if (!FIELD_NAMES.has(name)) {
			throw new TypeError(`Octane Lynx NodesRef fields options contain unknown field ${name}.`);
		}
		if (typeof enabled !== 'boolean') {
			throw new TypeError(`Octane Lynx NodesRef fields option ${name} must be boolean.`);
		}
		if (name === 'query' && enabled) {
			throw new TypeError('Octane Lynx NodesRef fields cannot return a live native SelectorQuery.');
		}
	}
	return fields as Readonly<Record<string, boolean>>;
}

function validateMeasureOptions(
	value: LynxMeasureOptions,
): Readonly<Record<string, UniversalSerializableValue>> {
	const options = cloneRecord(value, 'measure options');
	for (const name of Object.keys(options)) {
		if (
			name !== 'relativeTo' &&
			name !== 'androidEnableTransformProps' &&
			name !== 'iOSEnableAnimationProps'
		) {
			throw new TypeError(`Octane Lynx NodesRef measure options contain unknown field ${name}.`);
		}
	}
	if (
		options.relativeTo !== undefined &&
		options.relativeTo !== null &&
		typeof options.relativeTo !== 'string'
	) {
		throw new TypeError('Octane Lynx NodesRef measure relativeTo must be a string or null.');
	}
	if (
		options.androidEnableTransformProps !== undefined &&
		typeof options.androidEnableTransformProps !== 'boolean'
	) {
		throw new TypeError(
			'Octane Lynx NodesRef measure androidEnableTransformProps must be boolean.',
		);
	}
	if (
		options.iOSEnableAnimationProps !== undefined &&
		typeof options.iOSEnableAnimationProps !== 'boolean'
	) {
		throw new TypeError('Octane Lynx NodesRef measure iOSEnableAnimationProps must be boolean.');
	}
	return options;
}

function validateMeasureResult(value: UniversalSerializableValue): LynxMeasureResult {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError('Octane Lynx NodesRef measure returned a non-object result.');
	}
	const result = value as Readonly<Record<string, UniversalSerializableValue>>;
	if (typeof result.id !== 'string') {
		throw new TypeError('Octane Lynx NodesRef measure result id must be a string.');
	}
	if (
		result.dataset === null ||
		typeof result.dataset !== 'object' ||
		Array.isArray(result.dataset)
	) {
		throw new TypeError('Octane Lynx NodesRef measure result dataset must be an object.');
	}
	for (const name of ['left', 'right', 'top', 'bottom', 'width', 'height'] as const) {
		const coordinate = result[name];
		if (typeof coordinate !== 'number' || !Number.isFinite(coordinate)) {
			throw new TypeError(`Octane Lynx NodesRef measure result ${name} must be finite.`);
		}
	}
	return result as unknown as LynxMeasureResult;
}

function validateFieldsResult(value: unknown): LynxNodesRefFieldsResult {
	if (value === null) return null;
	return cloneRecord(value, 'fields result');
}

function validatePathResult(value: unknown): LynxNodesRefPathResult | null {
	if (value === null) return null;
	const result = cloneRecord(value, 'path result');
	if (!Array.isArray(result.data)) {
		throw new TypeError('Octane Lynx NodesRef path result data must be an array.');
	}
	for (let index = 0; index < result.data.length; index++) {
		const entry = result.data[index];
		if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
			throw new TypeError(`Octane Lynx NodesRef path result data[${index}] must be an object.`);
		}
		const record = entry as Readonly<Record<string, UniversalSerializableValue>>;
		if (typeof record.tag !== 'string' || typeof record.id !== 'string') {
			throw new TypeError(
				`Octane Lynx NodesRef path result data[${index}] requires string tag and id.`,
			);
		}
		if (!Array.isArray(record.class) || record.class.some((name) => typeof name !== 'string')) {
			throw new TypeError(`Octane Lynx NodesRef path result data[${index}].class is invalid.`);
		}
		if (
			record.dataSet === null ||
			typeof record.dataSet !== 'object' ||
			Array.isArray(record.dataSet)
		) {
			throw new TypeError(`Octane Lynx NodesRef path result data[${index}].dataSet is invalid.`);
		}
		if (!Number.isSafeInteger(record.index) || (record.index as number) < 0) {
			throw new TypeError(`Octane Lynx NodesRef path result data[${index}].index is invalid.`);
		}
	}
	return result as unknown as LynxNodesRefPathResult;
}

export function createLynxNodesRef(options: CreateLynxNodesRefOptions): LynxNodesRefBinding {
	if (options === null || typeof options !== 'object') {
		throw new TypeError('Octane Lynx NodesRef options must be an object.');
	}
	const identity = options.identity;
	if (identity === null || typeof identity !== 'object') {
		throw new TypeError('Octane Lynx NodesRef identity must be an object.');
	}
	positiveSafeInteger(identity.root, 'identity.root');
	positiveSafeInteger(identity.id, 'identity.id');
	positiveSafeInteger(identity.generation, 'identity.generation');
	nonEmptyString(identity.type, 'identity.type');
	nonEmptyString(identity.selector, 'identity.selector');
	if (typeof options.createSelectorQuery !== 'function') {
		throw new TypeError('Octane Lynx NodesRef createSelectorQuery must be a function.');
	}
	if (typeof options.readState !== 'function') {
		throw new TypeError('Octane Lynx NodesRef readState must be a function.');
	}

	const expected = Object.freeze({ ...identity });
	const createSelectorQuery = options.createSelectorQuery;
	const readState = options.readState;
	const pending = new Set<PendingOperation>();
	let invalidated: Error | null = null;

	const inactiveError = () =>
		new LynxNodesRefError(
			'inactive',
			`Octane Lynx NodesRef ${expected.id}:${expected.generation} is inactive.`,
		);

	const currentState = (attachmentEpoch: number | null = null): LynxNodesRefState => {
		if (invalidated !== null) throw invalidated;
		const state = readState();
		if (state === null || state.active !== true) throw inactiveError();
		nonNegativeSafeInteger(state.attachmentEpoch, 'state.attachmentEpoch');
		if (
			state.root !== expected.root ||
			state.id !== expected.id ||
			state.type !== expected.type ||
			state.generation !== expected.generation ||
			state.selector !== expected.selector
		) {
			throw new LynxNodesRefError(
				'stale',
				`Octane Lynx NodesRef ${expected.id}:${expected.generation} no longer owns its selector.`,
			);
		}
		if (attachmentEpoch !== null && state.attachmentEpoch !== attachmentEpoch) {
			throw new LynxNodesRefError(
				'stale',
				`Octane Lynx NodesRef ${expected.id}:${expected.generation} changed physical attachment while an operation was pending.`,
			);
		}
		return state;
	};

	const select = (selector: string): LynxNativeNodesRef => {
		const query = createSelectorQuery();
		if (query === null || typeof query !== 'object' || typeof query.select !== 'function') {
			throw new TypeError('Octane Lynx createSelectorQuery() returned an invalid query.');
		}
		const nativeRef = query.select(selector);
		if (nativeRef === null || typeof nativeRef !== 'object') {
			throw new TypeError('Octane Lynx SelectorQuery.select() returned an invalid NodesRef.');
		}
		return nativeRef;
	};

	const execute = <Value>(
		start: (
			selector: string,
			succeed: (value: Value) => void,
			fail: (error: Error) => void,
		) => void,
	): Promise<Value> =>
		new Promise<Value>((resolve, reject) => {
			let dispatching = true;
			let settled = false;
			let attachmentEpoch: number | null = null;
			let callbackOutcome: OperationOutcome<Value> | null = null;
			let forcedError: Error | null = null;

			const finish = (outcome: OperationOutcome<Value>) => {
				if (settled) return;
				settled = true;
				pending.delete(operation);
				if (outcome.ok) resolve(outcome.value);
				else reject(outcome.error);
			};
			const publish = (outcome: OperationOutcome<Value>) => {
				if (settled) return;
				if (dispatching) {
					callbackOutcome ??= outcome;
					return;
				}
				try {
					currentState(attachmentEpoch);
				} catch (error) {
					finish({
						ok: false,
						error: normalizedError(error, 'Octane Lynx NodesRef became inactive.'),
					});
					return;
				}
				finish(outcome);
			};
			const operation: PendingOperation = {
				reject(error) {
					if (settled) return;
					if (dispatching) forcedError ??= error;
					else finish({ ok: false, error });
				},
			};
			pending.add(operation);

			try {
				const state = currentState();
				attachmentEpoch = state.attachmentEpoch;
				start(
					state.selector,
					(value) => publish({ ok: true, value }),
					(error) => publish({ ok: false, error }),
				);
			} catch (error) {
				forcedError = normalizedError(error, 'Octane Lynx NodesRef operation failed.');
			}
			dispatching = false;

			if (forcedError !== null) {
				finish({ ok: false, error: forcedError });
				return;
			}
			try {
				currentState(attachmentEpoch);
			} catch (error) {
				finish({
					ok: false,
					error: normalizedError(error, 'Octane Lynx NodesRef became inactive.'),
				});
				return;
			}
			if (callbackOutcome !== null) finish(callbackOutcome);
		});

	const handle: LynxNodesRef = Object.freeze({
		root: expected.root,
		id: expected.id,
		type: expected.type,
		generation: expected.generation,
		get active() {
			try {
				currentState();
				return true;
			} catch {
				return false;
			}
		},
		invoke<Result extends UniversalSerializableValue = UniversalSerializableValue>(
			method: string,
			params: Readonly<Record<string, UniversalSerializableValue>> = {},
		): Promise<Result> {
			let clonedParams: Readonly<Record<string, UniversalSerializableValue>>;
			try {
				nonEmptyString(method, 'invoke method');
				clonedParams = cloneRecord(params, 'invoke params');
			} catch (error) {
				return Promise.reject(error);
			}
			return execute<Result>((selector, succeed, fail) => {
				const nativeRef = select(selector);
				if (typeof nativeRef.invoke !== 'function') {
					throw new TypeError('Octane Lynx native NodesRef does not support invoke().');
				}
				const task = nativeRef.invoke({
					method,
					params: clonedParams,
					success(value) {
						try {
							succeed(cloneSerializable(value, 'invoke result') as Result);
						} catch (error) {
							fail(normalizedError(error, 'Octane Lynx invoke returned an invalid result.'));
						}
					},
					fail(value) {
						fail(nativeFailure(value, 'invoke'));
					},
				});
				if (task === null || typeof task !== 'object' || typeof task.exec !== 'function') {
					throw new TypeError('Octane Lynx NodesRef.invoke() returned an invalid query task.');
				}
				task.exec();
			});
		},
		measure(measureOptions: LynxMeasureOptions = {}): Promise<LynxMeasureResult> {
			let params;
			try {
				params = validateMeasureOptions(measureOptions);
			} catch (error) {
				return Promise.reject(error);
			}
			return handle
				.invoke('boundingClientRect', params)
				.then((result) => validateMeasureResult(result));
		},
		fields(fieldOptions: LynxNodesRefFieldsOptions): Promise<LynxNodesRefFieldsResult> {
			let fields;
			try {
				fields = validateFieldsOptions(fieldOptions);
			} catch (error) {
				return Promise.reject(error);
			}
			return execute<LynxNodesRefFieldsResult>((selector, succeed, fail) => {
				const nativeRef = select(selector);
				if (typeof nativeRef.fields !== 'function') {
					throw new TypeError('Octane Lynx native NodesRef does not support fields().');
				}
				const task = nativeRef.fields(fields, (value, rawStatus) => {
					try {
						const status = nativeStatus(rawStatus, 'fields status');
						if (status.code !== 0) {
							fail(
								new LynxNodesRefError(
									'native',
									`Octane Lynx NodesRef fields failed with native code ${status.code}.`,
									status.code,
									status.data,
								),
							);
							return;
						}
						succeed(validateFieldsResult(value));
					} catch (error) {
						fail(normalizedError(error, 'Octane Lynx fields returned an invalid result.'));
					}
				});
				if (task === null || typeof task !== 'object' || typeof task.exec !== 'function') {
					throw new TypeError('Octane Lynx NodesRef.fields() returned an invalid query task.');
				}
				task.exec();
			});
		},
		path(): Promise<LynxNodesRefPathResult | null> {
			return execute<LynxNodesRefPathResult | null>((selector, succeed, fail) => {
				const nativeRef = select(selector);
				if (typeof nativeRef.path !== 'function') {
					throw new TypeError('Octane Lynx native NodesRef does not support path().');
				}
				const task = nativeRef.path((value, rawStatus) => {
					try {
						const status = nativeStatus(rawStatus, 'path status');
						if (status.code !== 0) {
							fail(
								new LynxNodesRefError(
									'native',
									`Octane Lynx NodesRef path failed with native code ${status.code}.`,
									status.code,
									status.data,
								),
							);
							return;
						}
						succeed(validatePathResult(value));
					} catch (error) {
						fail(normalizedError(error, 'Octane Lynx path returned an invalid result.'));
					}
				});
				if (task === null || typeof task !== 'object' || typeof task.exec !== 'function') {
					throw new TypeError('Octane Lynx NodesRef.path() returned an invalid query task.');
				}
				task.exec();
			});
		},
		setNativeProps(props: Readonly<Record<string, UniversalSerializableValue>>): Promise<void> {
			let clonedProps;
			try {
				clonedProps = cloneRecord(props, 'native props');
				if (
					Object.prototype.hasOwnProperty.call(clonedProps, 'style') ||
					Object.prototype.hasOwnProperty.call(clonedProps, 'ref') ||
					Object.prototype.hasOwnProperty.call(clonedProps, LYNX_NODES_REF_ATTRIBUTE)
				) {
					throw new TypeError(
						Object.prototype.hasOwnProperty.call(clonedProps, 'style')
							? 'Octane Lynx NodesRef setNativeProps cannot set the whole style prop.'
							: 'Octane Lynx NodesRef setNativeProps cannot replace its reserved ref selector.',
					);
				}
			} catch (error) {
				return Promise.reject(error);
			}
			return execute<void>((selector, succeed) => {
				const nativeRef = select(selector);
				if (typeof nativeRef.setNativeProps !== 'function') {
					throw new TypeError('Octane Lynx native NodesRef does not support setNativeProps().');
				}
				const task = nativeRef.setNativeProps(clonedProps);
				if (task === null || typeof task !== 'object' || typeof task.exec !== 'function') {
					throw new TypeError(
						'Octane Lynx NodesRef.setNativeProps() returned an invalid query task.',
					);
				}
				task.exec();
				succeed(undefined);
			});
		},
	});

	const binding: LynxNodesRefBinding = {
		handle,
		invalidateAttachment() {
			const error = inactiveError();
			for (const operation of [...pending]) operation.reject(error);
		},
		invalidate(reason) {
			if (invalidated !== null) return;
			invalidated =
				reason === undefined
					? inactiveError()
					: normalizedError(reason, 'Octane Lynx NodesRef was invalidated.');
			for (const operation of [...pending]) operation.reject(invalidated);
		},
	};
	return Object.freeze(binding);
}
