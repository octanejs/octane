import {
	attachBehaviorRoot,
	captureFormSubmissions,
	type BehaviorRegistration,
	type CapturedFormSubmission,
} from 'octane/behavior';
import { bootstrapIndependentHydration } from 'octane/hydration';
import { clicks, hydrated } from './actions.js';

type SerializableField = readonly [string, string | { name: string; size: number; type: string }];
type SubmissionPayload = {
	fields: readonly SerializableField[];
	form: CapturedFormSubmission['form'] | null;
	submitter: CapturedFormSubmission['submitter'];
	early: boolean;
	immutable: boolean;
};

const form = document.querySelector('#command-form') as HTMLFormElement;
const originalInput = form.elements.namedItem('draft') as HTMLInputElement;
const container = document.querySelector('#behavior-container')!;
const root = attachBehaviorRoot(
	new URLSearchParams(location.search).has('form-root') ? form : container,
	{ formSubmissions: captureFormSubmissions() },
);
const captures: SubmissionPayload[] = [];
const deliveries: Array<
	SubmissionPayload & { original: boolean; submitterSame: boolean; trusted: boolean }
> = [];
const errors: string[] = [];
const adoptions: string[] = [];
const cleanups: string[] = [];
let registration: BehaviorRegistration | undefined;
let islandLoads = 0;
let release!: () => void;
const ready = new Promise<void>((resolve) => {
	release = resolve;
});
const held = new URLSearchParams(location.search).has('hold');

function register(id = 'save'): void {
	registration = root.registerBehavior<SubmissionPayload>({
		id,
		target: '#command-form, #secondary-command-form',
		events: ['submit'],
		...(held ? { ready } : {}),
		captureEvent(event, element, submission) {
			event.preventDefault();
			const entries =
				submission?.fields ??
				Array.from(new FormData(element as HTMLFormElement, (event as SubmitEvent).submitter));
			const payload: SubmissionPayload = Object.freeze({
				fields: Object.freeze(
					entries.map(([name, value]) =>
						Object.freeze([
							name,
							typeof value === 'string'
								? value
								: Object.freeze({ name: value.name, size: value.size, type: value.type }),
						] as const),
					),
				),
				form: submission?.form ?? null,
				submitter: submission?.submitter ?? null,
				early: submission !== undefined,
				immutable:
					submission === undefined ||
					(Object.isFrozen(submission) &&
						Object.isFrozen(submission.fields) &&
						submission.fields.every(Object.isFrozen) &&
						Object.isFrozen(submission.form) &&
						(submission.submitter === null || Object.isFrozen(submission.submitter))),
			});
			captures.push(payload);
			return payload;
		},
		adopt(element) {
			adoptions.push(element.id);
			return () => {
				cleanups.push(element.id);
			};
		},
		handleEvent(event, _element, _context, payload) {
			const index = window.__formObservation.events.indexOf(event);
			deliveries.push({
				...payload,
				original: index !== -1,
				submitterSame:
					index !== -1 &&
					(event as SubmitEvent).submitter === window.__formObservation.submitters[index],
				trusted: event.isTrusted,
			});
		},
	});
}

if (!new URLSearchParams(location.search).has('no-owner')) register();

const stopHydration = bootstrapIndependentHydration(container, {
	buildId: 'form-submission-build',
	loadStyles() {},
	async loadModule() {
		islandLoads++;
		// The query requests the compiler's real independent boundary entrypoint.
		// @ts-expect-error The bundler owns independent Hydrate query modules.
		return import('./Form.tsrx?octane-hydrate=0');
	},
	onError(error) {
		errors.push(String(error));
	},
});

const harness = {
	release,
	register,
	disposeRegistration() {
		registration?.dispose();
	},
	dispose() {
		root.dispose({ preserveDOM: true });
		stopHydration();
	},
	state() {
		return {
			captures: captures.slice(),
			deliveries: deliveries.slice(),
			adoptions: adoptions.slice(),
			cleanups: cleanups.slice(),
			clicks: clicks.slice(),
			islandLoads,
			hydrated,
			errors: errors.slice(),
			inputSame: document.querySelector('#draft-input') === originalInput,
			value: originalInput.value,
			nativeSubmissions: window.__formObservation.events.length,
			canceled: window.__formObservation.events.map((event) => event.defaultPrevented),
		};
	},
};

window.__formSubmission = harness;

declare global {
	interface Window {
		__formSubmission: typeof harness;
		__formObservation: { events: Event[]; submitters: Array<HTMLElement | null> };
	}
}
