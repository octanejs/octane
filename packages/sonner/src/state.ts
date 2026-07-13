// Ported from sonner@2.0.7 src/state.ts
// (https://github.com/emilkowalski/sonner/tree/v2.0.7).
// The observer and promise state machine are renderer-independent. Octane's
// isValidElement replaces React.isValidElement for renderable result checks.
import { isValidElement } from 'octane';
import type {
	ExternalToast,
	PromiseData,
	PromiseIExtendedResult,
	PromiseT,
	ToastContent,
	ToastElement,
	ToastT,
	ToastToDismiss,
	ToastTypes,
} from './types';

let toastsCounter = 1;

type Title = (() => ToastContent) | ToastContent;
type PublishedToast = ToastT | ToastToDismiss;
type PromiseToastResult<ToastData> =
	| (string & { unwrap: () => Promise<ToastData> })
	| (number & { unwrap: () => Promise<ToastData> })
	| { unwrap: () => Promise<ToastData> };

class Observer {
	subscribers: Array<(toast: PublishedToast) => void>;
	toasts: Array<PublishedToast>;
	dismissedToasts: Set<string | number>;

	constructor() {
		this.subscribers = [];
		this.toasts = [];
		this.dismissedToasts = new Set();
	}

	// Arrow properties preserve the Observer receiver when methods are attached
	// directly to the callable toast function.
	subscribe = (subscriber: (toast: PublishedToast) => void): (() => void) => {
		this.subscribers.push(subscriber);

		return () => {
			const index = this.subscribers.indexOf(subscriber);
			if (index !== -1) this.subscribers.splice(index, 1);
		};
	};

	publish = (data: ToastT): void => {
		this.subscribers.forEach((subscriber) => subscriber(data));
	};

	addToast = (data: ToastT): void => {
		this.dismissedToasts.delete(data.id);
		this.publish(data);
		this.toasts = [...this.toasts, data];
	};

	create = (
		data: ExternalToast & {
			message?: Title;
			type?: ToastTypes;
			promise?: PromiseT;
			jsx?: ToastElement;
		},
	): number | string => {
		const { message, ...rest } = data;
		const id =
			typeof data.id === 'number' || (typeof data.id === 'string' && data.id.length > 0)
				? data.id
				: toastsCounter++;
		const alreadyExists = this.toasts.find((toast) => toast.id === id);
		const dismissible = data.dismissible === undefined ? true : data.dismissible;

		if (this.dismissedToasts.has(id)) {
			this.dismissedToasts.delete(id);
		}

		if (alreadyExists && !('dismiss' in alreadyExists)) {
			this.toasts = this.toasts.map((toast) => {
				if (toast.id === id && !('dismiss' in toast)) {
					this.publish({ ...toast, ...data, id, title: message });
					return {
						...toast,
						...data,
						id,
						dismissible,
						title: message,
					};
				}

				return toast;
			});
		} else {
			this.addToast({ title: message, ...rest, dismissible, id });
		}

		return id;
	};

	dismiss = (id?: number | string): number | string => {
		if (id !== undefined) {
			this.dismissedToasts.add(id);
			requestAnimationFrame(() => {
				this.subscribers.forEach((subscriber) => subscriber({ id, dismiss: true }));
			});
		} else {
			this.toasts.forEach((toast) => {
				this.dismissedToasts.add(toast.id);
				this.subscribers.forEach((subscriber) => subscriber({ id: toast.id, dismiss: true }));
			});
		}

		// Sonner's public 2.0.7 declaration returns the id even though a global
		// dismiss has no id at runtime. Preserve that published type contract.
		return id as number | string;
	};

	message = (message: Title, data?: ExternalToast): number | string =>
		this.create({ ...data, message });

	error = (message: Title, data?: ExternalToast): number | string =>
		this.create({ ...data, message, type: 'error' });

	success = (message: Title, data?: ExternalToast): number | string =>
		this.create({ ...data, type: 'success', message });

	info = (message: Title, data?: ExternalToast): number | string =>
		this.create({ ...data, type: 'info', message });

	warning = (message: Title, data?: ExternalToast): number | string =>
		this.create({ ...data, type: 'warning', message });

	loading = (message: Title, data?: ExternalToast): number | string =>
		this.create({ ...data, type: 'loading', message });

	promise = <ToastData>(
		promise: PromiseT<ToastData>,
		data?: PromiseData<ToastData>,
	): PromiseToastResult<ToastData> => {
		if (!data) return undefined as unknown as PromiseToastResult<ToastData>;

		let id: string | number | undefined;
		if (data.loading !== undefined) {
			id = this.create({
				...data,
				promise,
				type: 'loading',
				message: data.loading,
				description: typeof data.description !== 'function' ? data.description : undefined,
			});
		}

		const pending = Promise.resolve(promise instanceof Function ? promise() : promise);
		let shouldDismiss = id !== undefined;
		let result!: ['resolve', ToastData] | ['reject', unknown];

		const originalPromise = pending
			.then(async (response) => {
				result = ['resolve', response];
				if (isValidElement(response)) {
					shouldDismiss = false;
					this.create({ id, type: 'default', message: response });
				} else if (isHttpResponse(response) && !response.ok) {
					shouldDismiss = false;
					const error = `HTTP error! status: ${response.status}`;
					const promiseData =
						typeof data.error === 'function' ? await data.error(error) : data.error;
					const description =
						typeof data.description === 'function'
							? await data.description(error)
							: data.description;
					const isExtendedResult =
						typeof promiseData === 'object' && promiseData !== null && !isValidElement(promiseData);
					const toastSettings: PromiseIExtendedResult = isExtendedResult
						? (promiseData as PromiseIExtendedResult)
						: { message: promiseData };
					this.create({ id, type: 'error', description, ...toastSettings });
				} else if (response instanceof Error) {
					shouldDismiss = false;
					const promiseData =
						typeof data.error === 'function' ? await data.error(response) : data.error;
					const description =
						typeof data.description === 'function'
							? await data.description(response)
							: data.description;
					const isExtendedResult =
						typeof promiseData === 'object' && promiseData !== null && !isValidElement(promiseData);
					const toastSettings: PromiseIExtendedResult = isExtendedResult
						? (promiseData as PromiseIExtendedResult)
						: { message: promiseData };
					this.create({ id, type: 'error', description, ...toastSettings });
				} else if (data.success !== undefined) {
					shouldDismiss = false;
					const promiseData =
						typeof data.success === 'function' ? await data.success(response) : data.success;
					const description =
						typeof data.description === 'function'
							? await data.description(response)
							: data.description;
					const isExtendedResult =
						typeof promiseData === 'object' && promiseData !== null && !isValidElement(promiseData);
					const toastSettings: PromiseIExtendedResult = isExtendedResult
						? (promiseData as PromiseIExtendedResult)
						: { message: promiseData };
					this.create({ id, type: 'success', description, ...toastSettings });
				}
			})
			.catch(async (error) => {
				result = ['reject', error];
				if (data.error !== undefined) {
					shouldDismiss = false;
					const promiseData =
						typeof data.error === 'function' ? await data.error(error) : data.error;
					const description =
						typeof data.description === 'function'
							? await data.description(error)
							: data.description;
					const isExtendedResult =
						typeof promiseData === 'object' && promiseData !== null && !isValidElement(promiseData);
					const toastSettings: PromiseIExtendedResult = isExtendedResult
						? (promiseData as PromiseIExtendedResult)
						: { message: promiseData };
					this.create({ id, type: 'error', description, ...toastSettings });
				}
			})
			.finally(() => {
				if (shouldDismiss) {
					this.dismiss(id);
					id = undefined;
				}

				data.finally?.();
			});

		const unwrap = (): Promise<ToastData> =>
			new Promise((resolve, reject) => {
				originalPromise
					.then(() => (result[0] === 'reject' ? reject(result[1]) : resolve(result[1])))
					.catch(reject);
			});

		if (typeof id !== 'string' && typeof id !== 'number') return { unwrap };
		return Object.assign(id, { unwrap }) as PromiseToastResult<ToastData>;
	};

	custom = (jsx: (id: number | string) => ToastElement, data?: ExternalToast): number | string => {
		const id = data?.id || toastsCounter++;
		this.create({ jsx: jsx(id), ...data, id });
		return id;
	};

	getActiveToasts = (): PublishedToast[] =>
		this.toasts.filter((toast) => !this.dismissedToasts.has(toast.id));
}

export const ToastState = new Observer();

const toastFunction = (message: Title, data?: ExternalToast): number | string => {
	const id = data?.id || toastsCounter++;
	ToastState.addToast({ title: message, ...data, id });
	return id;
};

const isHttpResponse = (data: any): data is Response =>
	Boolean(
		data &&
		typeof data === 'object' &&
		'ok' in data &&
		typeof data.ok === 'boolean' &&
		'status' in data &&
		typeof data.status === 'number',
	);

const getHistory = (): PublishedToast[] => ToastState.toasts;
const getToasts = (): PublishedToast[] => ToastState.getActiveToasts();

export const toast = Object.assign(
	toastFunction,
	{
		success: ToastState.success,
		info: ToastState.info,
		warning: ToastState.warning,
		error: ToastState.error,
		custom: ToastState.custom,
		message: ToastState.message,
		promise: ToastState.promise,
		dismiss: ToastState.dismiss,
		loading: ToastState.loading,
	},
	{ getHistory, getToasts },
);
