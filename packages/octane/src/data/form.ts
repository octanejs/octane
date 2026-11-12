/**
 * Native forms for writes. A form posts its fields to the page's own URL, so
 * it works before hydration and without JavaScript: the server decodes them
 * with the write's declared fields, runs the write and answers 303, or renders
 * the page again with the submission's values and issues. Once hydrated, the
 * same form submits through the store instead, with the write's optimistic
 * edit, and keeps its pending state, values and issues in the store.
 */
import { DataError, type FormFields, type SchemaIssue, type Write } from './contracts.js';

/**
 * Hidden fields that name the write and the form. Field names starting with
 * `$` are reserved for these, so a write's own fields never collide with them.
 */
export const FORM_WRITE = '$write';
export const FORM_KEY = '$key';
export const FORM_TOKEN = '$token';
export const FORM_OPERATION = '$operation';

export interface FormState {
	readonly pending: boolean;
	/** The submitted text of a refused submission, to show again. Secret fields are left out. */
	readonly values: Readonly<Record<string, string>>;
	/** The first message for each field of a refused submission; one about the whole input is under `''`. */
	readonly issues: Readonly<Record<string, string>>;
	/** Why the last submission failed: a refusal's code, or `'uncertain'` when its outcome is unknown. */
	readonly error: string | null;
}

/** A refused native submission, carried to the page that shows it. */
interface FormOutcome extends FormState {
	readonly write: string;
	readonly key: string;
}

/**
 * A page's form credentials, from the server's `forms(request)`. The token is
 * signed for the request's account, so a form rendered for one account cannot
 * submit as another. The nonce makes each render's operation IDs new, so a
 * resubmitted page is applied once.
 */
export interface FormSeed {
	readonly token: string;
	readonly nonce: string;
	readonly outcome: FormOutcome | null;
}

export const NO_FORM_SEED: FormSeed = { token: '', nonce: '', outcome: null };

export const IDLE: FormState = { pending: false, values: {}, issues: {}, error: null };

type Entries = Iterable<readonly [string, FormDataEntryValue]>;

/**
 * Decode submitted fields into a write's input. Every declared field but a
 * checkbox must appear exactly once, and no undeclared field may appear; the
 * write's own schema validates the result.
 */
export function decodeForm(fields: FormFields, entries: Entries) {
	const seen = new Map<string, FormDataEntryValue>();
	const issues: SchemaIssue[] = [];
	for (const [name, value] of entries) {
		if (name.startsWith('$')) continue;
		if (!Object.hasOwn(fields, name)) issues.push({ message: 'Unexpected field', path: [name] });
		else if (seen.has(name)) issues.push({ message: 'Submitted more than once', path: [name] });
		else seen.set(name, value);
	}
	const input: Record<string, unknown> = {};
	const values: Record<string, string> = {};
	for (const name in fields) {
		const codec = fields[name];
		const value = seen.get(name);
		if (typeof value === 'string' && codec !== 'secret') values[name] = value;
		const issue = (message: string) => issues.push({ message, path: [name] });
		if (codec === 'checkbox') input[name] = value !== undefined;
		else if (value === undefined) issue('Required');
		else if (typeof value !== 'string') issue('Expected text');
		else if (codec === 'number') {
			const number = value.trim() === '' ? NaN : Number(value);
			if (Number.isFinite(number)) input[name] = number;
			else issue('Expected a number');
		} else if (codec === 'boolean') {
			if (value === 'true' || value === 'false') input[name] = value === 'true';
			else issue('Expected true or false');
		} else input[name] = value;
	}
	return { input, values, issues };
}

/** The first message for each field. */
export function issueMap(issues: ReadonlyArray<SchemaIssue> | undefined): Record<string, string> {
	const map: Record<string, string> = {};
	for (const issue of issues ?? []) {
		const first = issue.path?.[0];
		const field = String(typeof first === 'object' ? first.key : (first ?? ''));
		map[field] ??= issue.message;
	}
	return map;
}

/** A submit event from either renderer; React's carries the native event as `nativeEvent`. */
interface SubmitLike {
	preventDefault(): void;
	readonly currentTarget: EventTarget | null;
	readonly submitter?: HTMLElement | null;
	readonly nativeEvent?: { readonly submitter?: HTMLElement | null };
}

export interface FormHandle<I = unknown, O = unknown> {
	getSnapshot(): FormState;
	subscribe(notify: () => void): () => void;
	/** The hidden fields for a native POST: the write, this form, and the page's credentials, then `values`. */
	hidden(values?: { readonly [K in keyof I]?: I[K] }): Array<readonly [string, string]>;
	/**
	 * Submit through the store. Given a submit event, it stops the native POST,
	 * reads the form, and resets it on success unless it was edited meanwhile.
	 * Rejects as `write` does; a refusal also shows in the snapshot.
	 */
	submit(source: SubmitLike | FormData): Promise<O>;
}

/** A retired form must also cancel the browser's native POST. */
export function rejectSubmission(source: SubmitLike | FormData, reason: unknown): Promise<never> {
	if (!(source instanceof FormData)) source.preventDefault();
	return Promise.reject(reason);
}

const sameEntries = (a: FormData, b: FormData) => {
	const left = [...a];
	const right = [...b];
	return (
		left.length === right.length &&
		left.every(([k, v], i) => k === right[i][0] && v === right[i][1])
	);
};

/**
 * One form instance of a write. `key` separates instances, such as one per
 * row, so each has its own pending state and issues. Only the newest
 * submission's outcome is shown: a slow reply never replaces newer feedback.
 */
export function createFormHandle<I, O>(
	write: Write<I, O>,
	key: string,
	seed: FormSeed,
	run: (input: unknown) => Promise<O>,
	release: () => void,
	retiring: AbortSignal,
): FormHandle<I, O> {
	const fields = write.form;
	if (!fields) throw new Error(`octane/data: write "${write.name}" declares no form fields`);
	const outcome = seed.outcome;
	let state: FormState =
		outcome?.write === write.name && outcome.key === key
			? { pending: false, values: outcome.values, issues: outcome.issues, error: outcome.error }
			: IDLE;
	let latest = 0;
	const subscribers = new Set<() => void>();
	const set = (next: FormState) => {
		state = next;
		for (const notify of [...subscribers]) notify();
		// A form that unmounted mid-submission, as a removed row does, lets go once it settles.
		if (next === IDLE && subscribers.size === 0) release();
	};
	function retired() {
		state = IDLE;
		for (const notify of [...subscribers]) notify();
		subscribers.clear();
	}
	const base: Array<readonly [string, string]> = [[FORM_WRITE, write.name]];
	if (key) base.push([FORM_KEY, key]);
	if (seed.token) base.push([FORM_TOKEN, seed.token]);
	if (seed.nonce) base.push([FORM_OPERATION, `${seed.nonce}.${write.name}.${key}`]);

	return {
		getSnapshot: () => (retiring.aborted ? IDLE : state),
		subscribe(notify) {
			if (retiring.aborted) return () => {};
			if (subscribers.size === 0) retiring.addEventListener('abort', retired, { once: true });
			subscribers.add(notify);
			return () => {
				subscribers.delete(notify);
				if (subscribers.size === 0) retiring.removeEventListener('abort', retired);
				if (subscribers.size === 0 && state === IDLE) release();
			};
		},
		hidden(values) {
			if (retiring.aborted) return [];
			const entries = base.slice();
			for (const name in values) {
				const value = values[name];
				if (fields[name] === 'checkbox' ? value : value !== undefined) {
					entries.push([name, fields[name] === 'checkbox' ? 'on' : String(value)]);
				}
			}
			return entries;
		},
		submit(source) {
			if (retiring.aborted) return rejectSubmission(source, retiring.reason);
			let form: HTMLFormElement | null = null;
			let submitter: HTMLElement | null = null;
			let data: FormData;
			if (source instanceof FormData) data = source;
			else {
				source.preventDefault();
				form = source.currentTarget as HTMLFormElement;
				submitter = source.submitter ?? source.nativeEvent?.submitter ?? null;
				data = new FormData(form, submitter);
			}
			const id = ++latest;
			const decoded = decodeForm(fields, data);
			const refuse = (error: unknown): never => {
				if (!retiring.aborted && id === latest) {
					const code = error instanceof DataError ? error.code : 'uncertain';
					const issues = error instanceof DataError ? issueMap(error.issues) : IDLE.issues;
					set({ pending: false, values: decoded.values, issues, error: code });
				}
				throw error;
			};
			if (decoded.issues.length > 0) {
				try {
					refuse(new DataError('invalid', undefined, decoded.issues));
				} catch (error) {
					return Promise.reject(error);
				}
			}
			set({ pending: true, values: IDLE.values, issues: IDLE.issues, error: null });
			return run(decoded.input).then((output) => {
				if (!retiring.aborted && id === latest) {
					set(IDLE);
					if (form && sameEntries(new FormData(form, submitter), data)) form.reset();
				}
				return output;
			}, refuse);
		},
	};
}

/** Errors a form already shows; anything else is a bug and stays unhandled. */
const expected = (error: unknown) => {
	if (!(error instanceof Error && /^Data(Uncertain|Retired)?Error$/.test(error.name))) throw error;
};

export interface FormView<I, O, N> extends FormState {
	/** Spread on the `<form>`: it posts natively until hydrated, then submits through the store. */
	readonly attrs: { readonly method: 'post'; readonly onSubmit: (event: any) => void };
	/** Hidden inputs naming the write and the form, plus `values` for fields the user does not edit. */
	hidden(values?: { readonly [K in keyof I]?: I[K] }): N[];
	submit(source: SubmitLike | FormData): Promise<O>;
}

/** A renderer's form views, one per handle and snapshot, so an unchanged form is the same object. */
export function formViews<N>(createElement: (type: string, props: object) => N) {
	const cache = new WeakMap<
		FormHandle<any, any>,
		{ state: FormState; view: FormView<any, any, N> }
	>();
	return <I, O>(handle: FormHandle<I, O>, state: FormState): FormView<I, O, N> => {
		const cached = cache.get(handle);
		if (cached?.state === state) return cached.view;
		const view: FormView<I, O, N> = {
			...state,
			attrs: cached?.view.attrs ?? {
				method: 'post',
				onSubmit: (event) => {
					handle.submit(event).catch(expected);
				},
			},
			hidden: (values) =>
				handle
					.hidden(values)
					.map(([name, value]) =>
						createElement('input', { key: name, type: 'hidden', name, value }),
					),
			submit: handle.submit,
		};
		cache.set(handle, { state, view });
		return view;
	};
}
