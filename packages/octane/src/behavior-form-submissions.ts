import type {
	BehaviorCaptureHooks,
	BehaviorCaptureServices,
	DocumentRegistry,
	EntryRecord,
	RangeRecord,
	RootRecord,
} from './behavior-root-types.js';
import {
	FORM_SUBMISSION_ATTR,
	getEarlyFormSubmissionMailbox,
	isEarlyFormSubmissionCurrent,
	isEarlyFormSubmitActivation,
	type EarlyFormSubmissionMailbox,
	type EarlyFormSubmissionRecord,
} from './form-submission.js';
import {
	HYDRATE_ID_ATTR,
	HYDRATE_INDEPENDENT_ATTR,
	HYDRATE_WHEN_ATTR,
} from './hydration-markers.js';
import {
	EARLY_HYDRATION_INTENTS_KEY,
	HYDRATE_INTERACTION_EVENTS_ATTR,
} from './hydration/interaction-config.js';
import {
	captureNativeHydrationIntent,
	initializeHydrationEventCapture,
} from './hydration/event-capture.js';
import {
	getNativeHydrationCapture,
	getNativeHydrationDocument,
	getNativeHydrationDOM,
	NATIVE_HYDRATION_CAPTURE_KEY,
	type NativeHydrationCapture,
} from './hydration/native-intent.js';
import type { EarlyHydrationIntent } from './hydration/control-capture.js';

declare const FORM_SUBMISSION_CAPTURE: unique symbol;

/** Opaque synchronous opt-in produced by captureFormSubmissions(). */
export interface FormSubmissionCapture {
	readonly [FORM_SUBMISSION_CAPTURE]: true;
}

// Parser custody can outlive the last configured root. Weak routing authority
// must survive bridge detach without retaining commands after their lease ends.
let earlySubmissionRanges: WeakMap<EarlyFormSubmissionRecord, RangeRecord> | undefined;
let earlySubmissionRoots: WeakMap<EarlyFormSubmissionRecord, RootRecord> | undefined;
let controllers: WeakMap<DocumentRegistry, SubmissionController> | undefined;

type SubmissionController = BehaviorCaptureHooks & {
	readonly enabledRoots: Set<RootRecord>;
};

/**
 * Explicitly connect parser-time commands to this behavior root before any
 * registration can adopt its DOM. Unconfigured nested roots reserve their own
 * scope and keep the ordinary two-argument native captureEvent contract.
 */
export function captureFormSubmissions(): FormSubmissionCapture {
	const capture = (
		root: RootRecord,
		flush: BehaviorCaptureServices['flush'],
		fail: BehaviorCaptureServices['fail'],
		range: BehaviorCaptureServices['range'],
		matches: BehaviorCaptureServices['matches'],
		canceled: unknown,
	) => {
		root.dom = getNativeHydrationDOM(root.document);
		const mailbox = getEarlyFormSubmissionMailbox(root.document);
		if (mailbox === undefined) return;
		const services: BehaviorCaptureServices = { flush, fail, range, matches, canceled };
		installFormSubmissionActivation(root.document, mailbox);
		let controller = controllers?.get(root.registry);
		if (controller === undefined) {
			controller = createSubmissionController(root, mailbox, services);
			(controllers ??= new WeakMap()).set(root.registry, controller);
			root.registry.capture = controller;
		}
		controller.enabledRoots.add(root);
		controller.flush();
	};
	capture.document = getNativeHydrationDocument;
	return capture as unknown as FormSubmissionCapture;
}

function installFormSubmissionActivation(
	document: Document,
	mailbox: EarlyFormSubmissionMailbox,
): void {
	let feature = getNativeHydrationCapture(document);
	if (feature?.push !== undefined) return;
	if (feature === undefined) {
		feature = { skip: isEarlyFormSubmitActivation };
		(document as Document & { [NATIVE_HYDRATION_CAPTURE_KEY]?: NativeHydrationCapture })[
			NATIVE_HYDRATION_CAPTURE_KEY
		] = feature;
	}
	const seen = new WeakSet<Event>();
	const elementPrototype = formSubmissionElementPrototype(document);
	const dom = getNativeHydrationDOM(document);
	const queued = (packet: EarlyHydrationIntent) => {
		const [event, form, boundary, id, when, events] = packet;
		if (!packet[8] || seen.has(event)) return;
		seen.add(event);
		const record = mailbox.q.find((submission) => submission.event === event);
		const parent = record === undefined ? dom.parent(form) : record.parent;
		const key = record?.key ?? elementPrototype.getAttribute.call(form, FORM_SUBMISSION_ATTR);
		// Only routing metadata is captured here. Parser cleanup clears any
		// retained record's fields before discarding or releasing its command.
		const current = () =>
			!record?.discarded &&
			(record?.valid?.() ?? true) &&
			mailbox.captures(form as HTMLFormElement) &&
			event.target === form &&
			dom.connected(form) &&
			dom.connected(boundary) &&
			dom.owner(form) === document &&
			dom.owner(boundary) === document &&
			dom.parent(form) === parent &&
			elementPrototype.getAttribute.call(form, FORM_SUBMISSION_ATTR) === key &&
			elementPrototype.closest.call(form, `[${HYDRATE_INDEPENDENT_ATTR}]`) === boundary &&
			elementPrototype.getAttribute.call(boundary, HYDRATE_ID_ATTR) === id &&
			(when === 'interaction' || when === 'dynamic') &&
			elementPrototype.getAttribute.call(boundary, HYDRATE_WHEN_ATTR) === when &&
			elementPrototype.getAttribute.call(boundary, HYDRATE_INTERACTION_EVENTS_ATTR) === events;
		captureNativeHydrationIntent(boundary, event, current);
	};
	feature.push = queued;
	initializeHydrationEventCapture(document);
	const host = document as Document & {
		[EARLY_HYDRATION_INTENTS_KEY]?: {
			claimed?: boolean;
			q: EarlyHydrationIntent[];
			capture?: (intent: EarlyHydrationIntent) => void;
		};
	};
	const intents = host[EARLY_HYDRATION_INTENTS_KEY];
	// Generic capture may have parked commands before this explicit factory
	// arrived. Their sequence barriers have already been observed.
	for (const packet of intents?.q.splice(0) ?? []) queued(packet);
	// Forms-only parser capture can precede the first generic capture mailbox.
	for (const submission of mailbox.q) {
		if (
			seen.has(submission.event) ||
			submission.boundary === null ||
			submission.boundaryId === null
		)
			continue;
		intents?.capture?.([
			submission.event,
			submission.form,
			submission.boundary,
			submission.boundaryId,
			submission.boundaryWhen,
			submission.boundaryEvents,
			undefined,
			undefined,
			true,
			submission.sequence,
		]);
	}
}

function createSubmissionController(
	root: RootRecord,
	mailbox: EarlyFormSubmissionMailbox,
	services: BehaviorCaptureServices,
): SubmissionController {
	const registry = root.registry;
	const document = root.document;
	const enabledRoots = new Set<RootRecord>();
	const receive = (submission: EarlyFormSubmissionRecord): boolean =>
		receiveEarlyFormSubmission(document, registry, mailbox, submission, enabledRoots, services);
	const controller: SubmissionController = {
		enabledRoots,
		flush: () => mailbox.flush(),
		skip: (owner, event) => enabledRoots.has(owner) && mailbox.has(event),
		release: (entry) => {
			if (enabledRoots.has(entry.root)) releaseBehaviorSubmissions(entry, services);
		},
		dispose: (owner) => {
			// A canceled root never established custody in this document registry.
			if (registry.roots.get(owner.container) !== owner) return;
			// Release this exact scope before the core aborts/removes its owners.
			// Living nested scopes and unrelated parser leases remain authoritative.
			if (enabledRoots.has(owner)) {
				for (const entry of owner.behaviors) releaseBehaviorSubmissions(entry, services);
			}
			for (const submission of [...mailbox.q]) {
				if (
					containsFormSubmission(owner, submission.form) &&
					!hasNestedSubmissionOwner(owner, submission.form)
				)
					mailbox.release(submission.form);
			}
			enabledRoots.delete(owner);
			if (enabledRoots.size === 0) {
				if (mailbox.receive === receive) mailbox.receive = undefined;
				if (registry.capture === controller) registry.capture = undefined;
				controllers?.delete(registry);
			}
		},
	};
	mailbox.receive = receive;
	return controller;
}

/** Native methods cannot be hidden by successful controls named after DOM methods. */
function formSubmissionElementPrototype(document: Document): Element {
	return (document.defaultView?.Element ?? globalThis.Element).prototype;
}

function containsFormSubmission(root: RootRecord, form: Element): boolean {
	return getNativeHydrationDOM(root.document).contains(root.container, form);
}

function matchesFormSubmissionTarget(record: EntryRecord, form: Element): boolean {
	return typeof record.entry.target === 'string'
		? formSubmissionElementPrototype(record.root.document).matches.call(form, record.entry.target)
		: record.entry.target === form;
}

/** Transfer the original command into one exact behavior owner, without redispatch. */
function receiveEarlyFormSubmission(
	document: Document,
	registry: DocumentRegistry,
	mailbox: EarlyFormSubmissionMailbox,
	submission: EarlyFormSubmissionRecord,
	enabledRoots: Set<RootRecord>,
	services: BehaviorCaptureServices,
): boolean {
	if (submission.snapshot === undefined) return false;
	if (!isEarlyFormSubmissionCurrent(submission, document)) return true;
	const previousRoot = earlySubmissionRoots?.get(submission);
	if (
		previousRoot !== undefined &&
		(previousRoot.disposed ||
			previousRoot.controller.signal.aborted ||
			!containsFormSubmission(previousRoot, submission.form))
	) {
		submission.discarded = true;
		return true;
	}
	let rangeElement: Element | null = submission.form;
	let acceptedRange: RangeRecord | undefined;
	while (rangeElement !== null) {
		acceptedRange = registry.ranges.get(rangeElement);
		if (acceptedRange !== undefined) break;
		rangeElement = getNativeHydrationDOM(document).parent(rangeElement);
	}
	const previousRange = earlySubmissionRanges?.get(submission);
	if (previousRange !== undefined && previousRange !== acceptedRange) {
		submission.discarded = true;
		return true;
	}
	if (acceptedRange !== undefined && previousRange === undefined)
		(earlySubmissionRanges ??= new WeakMap()).set(submission, acceptedRange);
	let ownerRoot: RootRecord | undefined;
	for (const root of registry.roots.values()) {
		if (root.disposed || !containsFormSubmission(root, submission.form)) continue;
		if (
			ownerRoot === undefined ||
			formSubmissionElementPrototype(document).contains.call(ownerRoot.container, root.container)
		)
			ownerRoot = root;
	}
	// An attached nested root reserves its command scope while its module is
	// still registering; an ancestor with the same id cannot claim that command.
	if (ownerRoot !== undefined && previousRoot === undefined)
		(earlySubmissionRoots ??= new WeakMap()).set(submission, ownerRoot);
	const record =
		ownerRoot !== undefined && enabledRoots.has(ownerRoot)
			? ownerRoot.byId.get(submission.key)
			: undefined;
	if (
		record === undefined ||
		record.controller.signal.aborted ||
		!record.entry.events?.includes('submit') ||
		record.entry.captureEvent === undefined ||
		!matchesFormSubmissionTarget(record, submission.form) ||
		!services.matches(record, services.range(record.root, submission.form))
	)
		return false;
	const range = services.range(record.root, submission.form);
	const queued = {
		event: submission.event,
		element: submission.form,
		range,
		payload: services.canceled,
		valid: () => {
			const valid =
				!submission.discarded &&
				!record.controller.signal.aborted &&
				!record.root.controller.signal.aborted &&
				mailbox.captures(submission.form) &&
				containsFormSubmission(record.root, submission.form) &&
				isEarlyFormSubmissionCurrent(submission, document) &&
				services.range(record.root, submission.form) === range;
			if (!valid) submission.discarded = true;
			return valid;
		},
	};
	// Unclaimed commands have no owner validator. Once claimed, the same routing
	// fence guards queue delivery and activation throughout pending adoption.
	submission.valid = queued.valid;
	record.queue.push(queued);
	if (range?.status === 'pending') record.waiting.add(range);
	record.captureDepth = (record.captureDepth ?? 0) + 1;
	try {
		const payload = record.entry.captureEvent!(
			submission.event,
			submission.form,
			submission.snapshot,
		);
		if (
			!record.controller.signal.aborted &&
			containsFormSubmission(record.root, submission.form) &&
			matchesFormSubmissionTarget(record, submission.form) &&
			services.range(record.root, submission.form) === range &&
			isEarlyFormSubmissionCurrent(submission, document)
		)
			queued.payload = payload;
	} catch (error) {
		services.fail(record, error);
		throw error;
	} finally {
		record.captureDepth--;
	}
	// Only routing authority remains in the queue after application capture. A
	// small returned payload need not retain every accepted field or file.
	submission.snapshot = undefined;
	if (queued.payload === services.canceled) submission.discarded = true;
	services.flush(record);
	return true;
}

function hasNestedSubmissionOwner(root: RootRecord, form: Element): boolean {
	for (const nested of root.registry.roots.values()) {
		if (
			nested === root ||
			nested.disposed ||
			!formSubmissionElementPrototype(root.document).contains.call(
				root.container,
				nested.container,
			) ||
			!containsFormSubmission(nested, form)
		)
			continue;
		return true;
	}
	return false;
}

function releaseBehaviorSubmissions(record: EntryRecord, services: BehaviorCaptureServices): void {
	if (
		record.entry.id === undefined ||
		!record.entry.events?.includes('submit') ||
		record.entry.captureEvent === undefined
	)
		return;
	const mailbox = getEarlyFormSubmissionMailbox(record.root.document);
	if (mailbox === undefined) return;
	const elementPrototype = formSubmissionElementPrototype(record.root.document);
	for (const form of elementPrototype.querySelectorAll.call(
		record.root.container,
		`form[${FORM_SUBMISSION_ATTR}]`,
	) as NodeListOf<HTMLFormElement>) {
		if (
			elementPrototype.getAttribute.call(form, FORM_SUBMISSION_ATTR) === record.entry.id &&
			matchesFormSubmissionTarget(record, form) &&
			services.matches(record, services.range(record.root, form)) &&
			!hasNestedSubmissionOwner(record.root, form)
		)
			mailbox.release(form);
	}
	if (
		elementPrototype.matches.call(record.root.container, 'form') &&
		elementPrototype.getAttribute.call(record.root.container, FORM_SUBMISSION_ATTR) ===
			record.entry.id &&
		matchesFormSubmissionTarget(record, record.root.container) &&
		services.matches(record, services.range(record.root, record.root.container)) &&
		!hasNestedSubmissionOwner(record.root, record.root.container)
	)
		mailbox.release(record.root.container as HTMLFormElement);
}
