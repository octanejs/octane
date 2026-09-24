import { HYDRATE_ID_ATTR, HYDRATE_INDEPENDENT_ATTR } from './hydration-markers.js';

export const FORM_SUBMISSION_ATTR = 'data-octane-capture-submit';
export const EARLY_FORM_SUBMISSIONS_KEY = '__octaneEarlyFormSubmissions';
export const EARLY_FORM_SUBMISSIONS_LIMIT = 256;
export const EARLY_FORM_SUBMISSIONS_TIMEOUT_MS = 30_000;

/** Detached arguments accepted by the parser-time native submit listener. */
export interface CapturedFormSubmission {
	readonly fields: readonly (readonly [string, string | File])[];
	readonly form: {
		readonly id: string;
		readonly action: string;
		readonly method: string;
		readonly enctype: string;
		readonly target: string;
		readonly noValidate: boolean;
	};
	readonly submitter: {
		readonly id: string;
		readonly name: string;
		readonly value: string;
		readonly type: string;
		readonly formAction: string | null;
		readonly formMethod: string | null;
		readonly formEnctype: string | null;
		readonly formTarget: string | null;
		readonly formNoValidate: boolean;
	} | null;
}

/** @internal DOM references route custody; only snapshot is a public payload. */
export interface EarlyFormSubmissionRecord {
	readonly event: Event;
	readonly form: HTMLFormElement;
	readonly key: string;
	readonly parent: Element | null;
	readonly boundary: Element | null;
	readonly boundaryId: string | null;
	/** Routing or application capture invalidated this command, without releasing its form. */
	discarded?: true;
	/** Undefined while capture is reserved, or after the owner extracts its payload. */
	snapshot: CapturedFormSubmission | undefined;
}

/** @internal Parser-owned ingress continues while behavior owners are absent. */
export interface EarlyFormSubmissionMailbox {
	readonly version: 1;
	readonly q: EarlyFormSubmissionRecord[];
	receive?: (record: EarlyFormSubmissionRecord) => boolean;
	activate?: (record: EarlyFormSubmissionRecord) => void;
	overflow?: boolean;
	captures(form: HTMLFormElement): boolean;
	has(event: Event): boolean;
	flush(): void;
	release(form?: HTMLFormElement): void;
	stop(): void;
}

/** @internal Read only the parser protocol, without initializing client capture. */
export function getEarlyFormSubmissionMailbox(
	ownerDocument: Document,
): EarlyFormSubmissionMailbox | undefined {
	const candidate = (
		ownerDocument as Document & {
			[EARLY_FORM_SUBMISSIONS_KEY]?: EarlyFormSubmissionMailbox;
		}
	)[EARLY_FORM_SUBMISSIONS_KEY];
	return candidate?.version === 1 &&
		Array.isArray(candidate.q) &&
		typeof candidate.captures === 'function' &&
		typeof candidate.has === 'function' &&
		typeof candidate.flush === 'function' &&
		typeof candidate.release === 'function' &&
		typeof candidate.stop === 'function'
		? candidate
		: undefined;
}

/** @internal An accepted command cannot follow a moved or repurposed form. */
export function isEarlyFormSubmissionCurrent(
	record: EarlyFormSubmissionRecord,
	ownerDocument: Document,
): boolean {
	const form = record.form;
	const ElementConstructor = ownerDocument.defaultView?.Element ?? globalThis.Element;
	return (
		record.event.target === form &&
		form.ownerDocument === ownerDocument &&
		form.isConnected &&
		form.parentElement === record.parent &&
		ElementConstructor.prototype.getAttribute.call(form, FORM_SUBMISSION_ATTR) === record.key &&
		ElementConstructor.prototype.closest.call(form, `[${HYDRATE_INDEPENDENT_ATTR}]`) ===
			record.boundary &&
		(record.boundary === null ||
			ElementConstructor.prototype.getAttribute.call(record.boundary, HYDRATE_ID_ATTR) ===
				record.boundaryId)
	);
}

/** @internal Native form association also covers controls outside their form. */
export function formSubmissionControl(
	target: Element,
): HTMLButtonElement | HTMLInputElement | null {
	const ElementConstructor = target.ownerDocument.defaultView?.Element ?? globalThis.Element;
	const control = ElementConstructor.prototype.closest.call(target, 'button,input') as
		HTMLButtonElement | HTMLInputElement | null;
	return control !== null &&
		(control.localName === 'button'
			? control.type === 'submit'
			: control.type === 'submit' || control.type === 'image')
		? control
		: null;
}

/** @internal Let validation and native submit occur instead of replaying a click. */
export function isEarlyFormSubmitActivation(event: Event): boolean {
	if (event.type !== 'click') return false;
	const target = event.target;
	if (target === null || (target as Node).nodeType !== 1) return false;
	const element = target as Element;
	if (getEarlyFormSubmissionMailbox(element.ownerDocument) === undefined) return false;
	const form = formSubmissionControl(element)?.form;
	const ElementConstructor = element.ownerDocument.defaultView?.Element ?? globalThis.Element;
	// Release stops command capture, but submit-button activation must continue to
	// reach the native default instead of being deferred again as a replayed click.
	return (
		form != null && !!ElementConstructor.prototype.getAttribute.call(form, FORM_SUBMISSION_ATTR)
	);
}
