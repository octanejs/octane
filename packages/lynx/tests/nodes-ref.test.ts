import { describe, expect, it } from 'vitest';
import {
	createLynxNodesRef,
	LynxNodesRefError,
	type LynxCreateSelectorQuery,
	type LynxNativeInvokeOptions,
	type LynxNativeNodesRef,
	type LynxNodesRefIdentity,
	type LynxNodesRefState,
} from '../src/core/nodes-ref.js';

interface InvokeCall {
	readonly options: LynxNativeInvokeOptions;
	submitted: boolean;
}

interface FieldsCall {
	readonly fields: Readonly<Record<string, boolean>>;
	readonly callback: (value: unknown, status: unknown) => void;
	submitted: boolean;
}

interface PathCall {
	readonly callback: (value: unknown, status: unknown) => void;
	submitted: boolean;
}

interface NativePropsCall {
	readonly props: Readonly<Record<string, unknown>>;
	submitted: boolean;
}

function createNativeHarness() {
	const selectors: string[] = [];
	const invokes: InvokeCall[] = [];
	const fields: FieldsCall[] = [];
	const paths: PathCall[] = [];
	const nativeProps: NativePropsCall[] = [];
	let invokeExec: ((options: LynxNativeInvokeOptions) => void) | null = null;
	let selectError: Error | null = null;

	const nativeRef: LynxNativeNodesRef = {
		invoke(options) {
			const call: InvokeCall = { options, submitted: false };
			invokes.push(call);
			return {
				exec() {
					call.submitted = true;
					invokeExec?.(options);
				},
			};
		},
		fields(options, callback) {
			const call: FieldsCall = { fields: options, callback, submitted: false };
			fields.push(call);
			return {
				exec() {
					call.submitted = true;
				},
			};
		},
		path(callback) {
			const call: PathCall = { callback, submitted: false };
			paths.push(call);
			return {
				exec() {
					call.submitted = true;
				},
			};
		},
		setNativeProps(props) {
			const call: NativePropsCall = { props, submitted: false };
			nativeProps.push(call);
			return {
				exec() {
					call.submitted = true;
				},
			};
		},
	};

	const createSelectorQuery: LynxCreateSelectorQuery = () => ({
		select(selector) {
			selectors.push(selector);
			if (selectError !== null) throw selectError;
			return nativeRef;
		},
	});

	return {
		createSelectorQuery,
		fields,
		invokes,
		nativeProps,
		paths,
		selectors,
		setInvokeExec(value: ((options: LynxNativeInvokeOptions) => void) | null) {
			invokeExec = value;
		},
		setSelectError(value: Error | null) {
			selectError = value;
		},
	};
}

const IDENTITY: LynxNodesRefIdentity = {
	root: 7,
	id: 11,
	type: 'view',
	generation: 3,
	selector: '#octane-lynx-7-11-3',
};

function createBinding(harness: ReturnType<typeof createNativeHarness>) {
	let state: LynxNodesRefState | null = { ...IDENTITY, active: true };
	const binding = createLynxNodesRef({
		identity: IDENTITY,
		createSelectorQuery: harness.createSelectorQuery,
		readState: () => state,
	});
	return {
		binding,
		setState(value: LynxNodesRefState | null) {
			state = value;
		},
	};
}

describe('Lynx background NodesRef adapter', () => {
	it('submits selector-query operations with detached data results', async () => {
		const harness = createNativeHarness();
		const { binding } = createBinding(harness);
		const params = { payload: { count: 1 }, labels: ['one'] };

		const invokePromise = binding.handle.invoke('scrollTo', params);
		const invoke = harness.invokes[0];
		expect(invoke.submitted).toBe(true);
		expect(invoke.options.method).toBe('scrollTo');
		expect(invoke.options.params).toEqual(params);
		expect(invoke.options.params).not.toBe(params);
		expect(Object.isFrozen(invoke.options.params)).toBe(true);
		params.payload.count = 2;
		expect(invoke.options.params).toMatchObject({ payload: { count: 1 } });

		const nativeResult = { complete: true, detail: { offset: 24 } };
		invoke.options.success(nativeResult);
		nativeResult.detail.offset = 48;
		const result = await invokePromise;
		expect(result).toEqual({ complete: true, detail: { offset: 24 } });
		expect(Object.isFrozen(result)).toBe(true);
		expect(Object.isFrozen((result as { detail: object }).detail)).toBe(true);

		const measurePromise = binding.handle.measure({
			relativeTo: 'screen',
			androidEnableTransformProps: true,
			iOSEnableAnimationProps: true,
		});
		const measure = harness.invokes[1];
		expect(measure.options).toMatchObject({
			method: 'boundingClientRect',
			params: {
				relativeTo: 'screen',
				androidEnableTransformProps: true,
				iOSEnableAnimationProps: true,
			},
		});
		measure.options.success({
			id: 'card',
			dataset: { role: 'summary' },
			left: 10,
			right: 90,
			top: 20,
			bottom: 60,
			width: 80,
			height: 40,
		});
		await expect(measurePromise).resolves.toEqual({
			id: 'card',
			dataset: { role: 'summary' },
			left: 10,
			right: 90,
			top: 20,
			bottom: 60,
			width: 80,
			height: 40,
		});

		const fieldsPromise = binding.handle.fields({ id: true, dataset: true });
		const fields = harness.fields[0];
		expect(fields.submitted).toBe(true);
		expect(fields.fields).toEqual({ id: true, dataset: true });
		fields.callback({ id: 'card', dataset: { role: 'summary' } }, { code: 0, data: 'success' });
		await expect(fieldsPromise).resolves.toEqual({
			id: 'card',
			dataset: { role: 'summary' },
		});

		const pathPromise = binding.handle.path();
		const path = harness.paths[0];
		expect(path.submitted).toBe(true);
		path.callback(
			{
				data: [
					{
						tag: 'view',
						id: 'card',
						class: ['summary'],
						dataSet: { role: 'summary' },
						index: 0,
					},
				],
			},
			{ code: 0, data: 'success' },
		);
		await expect(pathPromise).resolves.toEqual({
			data: [
				{
					tag: 'view',
					id: 'card',
					class: ['summary'],
					dataSet: { role: 'summary' },
					index: 0,
				},
			],
		});

		const props = { hidden: true, 'accessibility-label': 'ready' };
		await binding.handle.setNativeProps(props);
		expect(harness.nativeProps[0]).toMatchObject({ props, submitted: true });
		expect(harness.nativeProps[0].props).not.toBe(props);
		expect(harness.selectors).toEqual(Array(5).fill(IDENTITY.selector));
	});

	it('rejects inactive and generation-stale handles and settles invalidated work', async () => {
		const harness = createNativeHarness();
		const context = createBinding(harness);

		const stalePromise = context.binding.handle.invoke('focus');
		context.setState({
			...IDENTITY,
			generation: IDENTITY.generation + 1,
			selector: '#octane-lynx-7-11-4',
			active: true,
		});
		harness.invokes[0].options.success({ focused: true });
		await expect(stalePromise).rejects.toMatchObject({ code: 'stale' });
		expect(context.binding.handle.active).toBe(false);

		context.setState(null);
		await expect(context.binding.handle.invoke('blur')).rejects.toMatchObject({
			code: 'inactive',
		});
		expect(harness.selectors).toHaveLength(1);

		const freshHarness = createNativeHarness();
		const fresh = createBinding(freshHarness);
		const inFlight = fresh.binding.handle.invoke('requestLayout').catch((error: unknown) => error);
		const reason = new Error('transport closed');
		fresh.binding.invalidate(reason);
		expect(await inFlight).toBe(reason);
		expect(fresh.binding.handle.active).toBe(false);
		freshHarness.invokes[0].options.success({ ignored: true });
	});

	it('rejects non-data input, invalid native results, and native status failures', async () => {
		const harness = createNativeHarness();
		const { binding } = createBinding(harness);
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;

		await expect(binding.handle.invoke('update', cyclic as never)).rejects.toThrow(/cycle/);
		await expect(binding.handle.fields({ query: true } as never)).rejects.toThrow(
			/live native SelectorQuery/,
		);
		await expect(binding.handle.setNativeProps({ ref: 'replacement' })).rejects.toThrow(
			/reserved ref selector/,
		);
		await expect(binding.handle.setNativeProps({ style: { opacity: 0.5 } })).rejects.toThrow(
			/cannot set the whole style prop/,
		);
		expect(harness.selectors).toHaveLength(0);

		const invalidResult = binding.handle.invoke('readState');
		harness.invokes[0].options.success(new Date());
		await expect(invalidResult).rejects.toThrow(/arrays or plain objects/);

		const fieldsFailure = binding.handle.fields({ id: true });
		harness.fields[0].callback(null, { code: 2, data: { reason: 'node not found' } });
		await expect(fieldsFailure).rejects.toMatchObject({
			code: 'native',
			nativeCode: 2,
			data: { reason: 'node not found' },
		});

		const malformedPath = binding.handle.path();
		harness.paths[0].callback(
			{ data: [{ tag: 'view', id: 'card', class: [], dataSet: {}, index: -1 }] },
			{ code: 0, data: 'success' },
		);
		await expect(malformedPath).rejects.toThrow(/index is invalid/);
	});

	it('prefers synchronous query throws over callbacks fired by the same submission', async () => {
		const harness = createNativeHarness();
		const { binding } = createBinding(harness);
		const execError = new Error('selector query exec failed');
		harness.setInvokeExec((options) => {
			options.success({ completed: true });
			throw execError;
		});

		await expect(binding.handle.invoke('focus')).rejects.toBe(execError);

		const selectError = new Error('selector selection failed');
		harness.setInvokeExec(null);
		harness.setSelectError(selectError);
		await expect(binding.handle.invoke('blur')).rejects.toBe(selectError);
	});

	it('uses a typed native error for invoke failures', async () => {
		const harness = createNativeHarness();
		const { binding } = createBinding(harness);
		const promise = binding.handle.invoke('focus');
		harness.invokes[0].options.fail({ code: 3, data: { method: 'focus' } });

		const error = await promise.catch((reason: unknown) => reason);
		expect(error).toBeInstanceOf(LynxNodesRefError);
		expect(error).toMatchObject({
			code: 'native',
			nativeCode: 3,
			data: { method: 'focus' },
		});
	});
});
