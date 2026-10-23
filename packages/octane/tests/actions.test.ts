import { describe, it, expect, vi } from 'vitest';
import { act, mount, flushEffects } from './_helpers';
import {
	flushSync,
	getTransitionFallbackTimeout,
	setFormAction,
	setTransitionFallbackTimeout,
	startTransition,
} from '../src/index.js';
import {
	ActionForm,
	SubmitterActionForm,
	FormWithStatus,
	CommittedWrapperFrontierPortaledFormWithStatus,
	FrontierPortaledFormWithStatus,
	FrontierInnerFormPortaledFormWithStatus,
	FrontierWrappedInnerFormPortaledFormWithStatus,
	NestedFrontierPortaledFormWithStatus,
	NestedPortaledFormWithStatus,
	PortaledFormWithStatus,
	RawFormWithStatus,
	StatusProbe,
	SelfFormStatus,
	NestedSelfFormStatus,
	OptimisticForm,
	BareOptimistic,
	OptimisticCounter,
	OptimisticSuspenseAction,
	SuspendedTransitionRoot,
	OptimisticSupersededTransition,
	DirectAction,
	ExposedDispatch,
	RawForm,
} from './_fixtures/actions.tsrx';

// React 19 Actions: <form action={fn}>, useActionState, useFormStatus, useOptimistic.

function deferred<T = void>() {
	let resolve!: (v: T) => void;
	let reject!: (e: any) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function suspenseGate() {
	const gate = deferred();
	let ready = false;
	return {
		read: () => {
			if (!ready) throw gate.promise;
			return 'ready';
		},
		resolve: () => {
			ready = true;
			gate.resolve();
		},
	};
}

// Commit a microtask's worth of scheduled (transition-priority) work — used to
// observe state mid-action (the async action body runs on a microtask after the
// synchronous submit, so optimistic/pending updates land a tick later).
async function tick() {
	await Promise.resolve();
	await Promise.resolve();
	flushSync(() => {});
	flushEffects();
}

// Fully drain the microtask queue + commit all scheduled renders/effects. The
// action chain nests several promise layers (chain → transition → action await),
// so drain generously then commit.
async function settle() {
	for (let i = 0; i < 30; i++) await Promise.resolve();
	flushSync(() => {});
	flushEffects();
}

function submit(container: HTMLElement, selector = 'form', submitter?: HTMLElement) {
	const form = container.querySelector(selector) as HTMLFormElement;
	flushSync(() => {
		form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter }));
	});
	return form;
}

describe('useActionState + <form action>', () => {
	it.each([
		['form action', ActionForm],
		['submitter formAction', SubmitterActionForm],
	] as const)(
		'accepts async dispatch through %s without an outside-action diagnostic',
		async (_name, Component) => {
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			const d = deferred();
			const r = mount(Component, {
				action: (_prev: string, fd: FormData) => d.promise.then(() => 'got:' + fd.get('name')),
				initial: 'init',
			});
			try {
				(r.find('#field') as HTMLInputElement).value = 'alice';
				submit(r.container, 'form', r.find('#submit') as HTMLElement);
				await tick();
				expect(r.find('#pending').textContent).toBe('pending');
				d.resolve();
				await settle();
				expect(r.find('#state').textContent).toBe('got:alice');
				expect(r.find('#pending').textContent).toBe('idle');
				expect(error).not.toHaveBeenCalled();
			} finally {
				r.unmount();
				error.mockRestore();
			}
		},
	);

	it('runs action(prev, formData), flips isPending, and commits the returned state', async () => {
		const d = deferred();
		const action = (_prev: string, fd: FormData) => d.promise.then(() => 'got:' + fd.get('name'));
		const r = mount(ActionForm, { action, initial: 'init' });
		flushSync(() => {});
		expect(r.find('#state').textContent).toBe('init');
		expect(r.find('#pending').textContent).toBe('idle');

		(r.find('#field') as HTMLInputElement).value = 'alice';
		submit(r.container);
		// isPending flips true synchronously at dispatch; state not yet updated.
		expect(r.find('#pending').textContent).toBe('pending');
		expect(r.find('#state').textContent).toBe('init');

		d.resolve();
		await settle();
		expect(r.find('#pending').textContent).toBe('idle');
		expect(r.find('#state').textContent).toBe('got:alice');
		r.unmount();
	});

	it('queues dispatches sequentially, threading the previous result', async () => {
		const seen: string[] = [];
		// Each action appends the payload to the previous state.
		const action = async (prev: string, fd: FormData) => {
			const v = String(fd.get('name'));
			await Promise.resolve();
			seen.push(prev + '>' + v);
			return prev + '/' + v;
		};
		const r = mount(ActionForm, { action, initial: 'a' });
		flushSync(() => {});
		(r.find('#field') as HTMLInputElement).value = 'b';
		submit(r.container);
		(r.find('#field') as HTMLInputElement).value = 'c';
		submit(r.container);
		await settle();
		// Sequential: second dispatch saw the first's committed result.
		expect(seen).toEqual(['a>b', 'a/b>c']);
		expect(r.find('#state').textContent).toBe('a/b/c');
		r.unmount();
	});

	// React captures the action on the queue node at dispatch time: a submission
	// queued before a rerender runs the action it was submitted to, not the
	// replacement. Only submissions dispatched after the rerender use the new one.
	it.each([
		['form action', ActionForm, 'fulfils'],
		['submitter formAction', SubmitterActionForm, 'fulfils'],
		['form action', ActionForm, 'rejects'],
	] as const)(
		'runs a queued %s submission with its dispatch-time action when the first %s',
		async (_name, Component, outcome) => {
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			const gate = deferred();
			const saved: string[] = [];
			const oldAction = async (prev: string, data: FormData) => {
				const name = String(data.get('name'));
				if (name === 'first') {
					await gate.promise;
					if (outcome === 'rejects') throw new Error('first failed');
				}
				saved.push('old:' + name);
				return prev + '/old:' + name;
			};
			const newAction = async (prev: string, data: FormData) => {
				const name = String(data.get('name'));
				saved.push('new:' + name);
				return prev + '/new:' + name;
			};
			const r = mount(Component, { action: oldAction, initial: 'init' });
			const send = (name: string) => {
				(r.find('#field') as HTMLInputElement).value = name;
				submit(r.container, 'form', r.find('#submit') as HTMLElement);
			};
			try {
				send('first');
				await settle();
				send('second');
				r.update(Component, { action: newAction, initial: 'init' });
				gate.resolve();
				await settle();
				send('third');
				await settle();
				expect(saved).toEqual(
					outcome === 'rejects'
						? ['old:second', 'new:third']
						: ['old:first', 'old:second', 'new:third'],
				);
				expect(r.find('#state').textContent).toBe(
					outcome === 'rejects'
						? 'init/old:second/new:third'
						: 'init/old:first/old:second/new:third',
				);
				expect(r.find('#pending').textContent).toBe('idle');
				// An errored action still continues the queue (documented divergence).
				expect(error).toHaveBeenCalledTimes(outcome === 'rejects' ? 1 : 0);
			} finally {
				gate.resolve();
				await settle();
				r.unmount();
				error.mockRestore();
			}
		},
	);

	it('runs a directly dispatched payload with its dispatch-time action', async () => {
		const gate = deferred();
		const saved: string[] = [];
		const oldAction = async (prev: string, payload: string) => {
			if (payload === 'first') await gate.promise;
			saved.push('old:' + payload);
			return prev + '/old:' + payload;
		};
		const newAction = (prev: string, payload: string) => {
			saved.push('new:' + payload);
			return prev + '/new:' + payload;
		};
		let dispatch!: (payload: string) => void;
		const expose = (fn: typeof dispatch) => (dispatch = fn);
		const r = mount(ExposedDispatch, { action: oldAction, initial: 'init', expose });
		try {
			flushSync(() => startTransition(() => dispatch('first')));
			flushSync(() => startTransition(() => dispatch('second')));
			r.update(ExposedDispatch, { action: newAction, initial: 'init', expose });
			gate.resolve();
			await settle();
			flushSync(() => startTransition(() => dispatch('third')));
			await settle();
			expect(saved).toEqual(['old:first', 'old:second', 'new:third']);
			expect(r.find('#state').textContent).toBe('init/old:first/old:second/new:third');
			expect(r.find('#pending').textContent).toBe('idle');
		} finally {
			gate.resolve();
			await settle();
			r.unmount();
		}
	});
});

describe('useFormStatus', () => {
	it('reports the ancestor form’s pending status to a descendant', async () => {
		const d = deferred();
		const action = (_p: any, _fd: FormData) => d.promise;
		const r = mount(FormWithStatus, { action });
		flushSync(() => {});
		expect(r.find('#status').textContent).toBe('idle');

		submit(r.container);
		expect(r.find('#status').textContent).toBe('pending:post');

		d.resolve();
		await settle();
		expect(r.find('#status').textContent).toBe('idle');
		r.unmount();
	});

	it('reports the logical ancestor form’s pending status through a portal', async () => {
		const d = deferred();
		let submittedDraft: FormDataEntryValue | null = null;
		const target = document.createElement('aside');
		document.body.appendChild(target);
		const r = mount(PortaledFormWithStatus, {
			action: (data: FormData) => {
				submittedDraft = data.get('draft');
				return d.promise;
			},
			target,
		});
		try {
			flushSync(() => {});
			const form = r.find('#save-form');
			const button = target.querySelector('#portal-status') as HTMLButtonElement;
			expect(button.form).toBe(form);
			expect(button.textContent).toBe('idle');
			expect(button.disabled).toBe(false);
			expect(button.getAttribute('data-scope')).toBe('owned');

			(r.find('#field') as HTMLInputElement).value = 'edited';
			flushSync(() => (form as HTMLFormElement).requestSubmit(button));
			await tick();
			expect(submittedDraft).toBe('edited');
			expect(button.textContent).toBe('pending:edited');
			expect(button.disabled).toBe(true);
			expect(button.getAttribute('data-scope')).toBe('owned');

			d.resolve();
			await settle();
			expect(button.textContent).toBe('idle');
			expect(button.disabled).toBe(false);
		} finally {
			d.resolve();
			await settle();
			r.unmount();
			target.remove();
		}
	});

	it('resolves a portaled form status when its source wrapper is still in a frontier', async () => {
		const d = deferred();
		let showPortal!: () => void;
		let submittedDraft: FormDataEntryValue | null = null;
		const target = document.createElement('aside');
		document.body.appendChild(target);
		const r = mount(FrontierPortaledFormWithStatus, {
			action: (data: FormData) => {
				submittedDraft = data.get('draft');
				return d.promise;
			},
			target,
			expose: (show: () => void) => (showPortal = show),
		});
		try {
			flushSync(() => {});
			const form = r.find('#save-form') as HTMLFormElement;
			expect(target.querySelector('#portal-status')).toBeNull();

			// The form is already committed; the new wrapper and its portal mount
			// together through a detached frontier on this update.
			flushSync(() => showPortal());
			const button = target.querySelector('#portal-status') as HTMLButtonElement;
			expect(button.form).toBe(form);
			expect(button.textContent).toBe('idle');
			expect(button.disabled).toBe(false);
			expect(button.getAttribute('data-scope')).toBe('frontier');

			(r.find('#field') as HTMLInputElement).value = 'edited';
			flushSync(() => form.requestSubmit(button));
			await tick();
			expect(submittedDraft).toBe('edited');
			expect(button.textContent).toBe('pending:edited');
			expect(button.disabled).toBe(true);
			expect(button.getAttribute('data-scope')).toBe('frontier');

			d.resolve();
			await settle();
			expect(button.textContent).toBe('idle');
			expect(button.disabled).toBe(false);
		} finally {
			d.resolve();
			await settle();
			r.unmount();
			target.remove();
		}
	});

	it('finds the source form through a committed wrapper around a frontier portal', async () => {
		const d = deferred();
		let showPortal!: () => void;
		let submittedDraft: FormDataEntryValue | null = null;
		const target = document.createElement('aside');
		document.body.appendChild(target);
		const r = mount(CommittedWrapperFrontierPortaledFormWithStatus, {
			action: (data: FormData) => {
				submittedDraft = data.get('draft');
				return d.promise;
			},
			target,
			expose: (show: () => void) => (showPortal = show),
		});
		try {
			flushSync(() => {});
			const form = r.find('#save-form') as HTMLFormElement;
			flushSync(() => showPortal());
			const button = target.querySelector('#portal-status') as HTMLButtonElement;
			expect(button.form).toBe(form);
			expect(button.textContent).toBe('idle');
			expect(button.getAttribute('data-scope')).toBe('committed-wrapper');

			(r.find('#field') as HTMLInputElement).value = 'edited';
			flushSync(() => form.requestSubmit(button));
			await tick();
			expect(submittedDraft).toBe('edited');
			expect(button.textContent).toBe('pending:edited');

			d.resolve();
			await settle();
			expect(button.textContent).toBe('idle');
		} finally {
			d.resolve();
			await settle();
			r.unmount();
			target.remove();
		}
	});

	it('does not use an outer portal target form as the logical ancestor', async () => {
		const d = deferred();
		let submittedDraft: FormDataEntryValue | null = null;
		const outerTarget = document.createElement('aside');
		const innerTarget = document.createElement('form');
		innerTarget.id = 'other-form';
		document.body.append(outerTarget, innerTarget);
		const r = mount(NestedPortaledFormWithStatus, {
			action: (data: FormData) => {
				submittedDraft = data.get('draft');
				return d.promise;
			},
			outerTarget,
			innerTarget,
		});
		try {
			flushSync(() => {});
			const form = r.find('#save-form') as HTMLFormElement;
			const button = innerTarget.querySelector('#portal-status') as HTMLButtonElement;
			expect(button.form).toBe(form);
			expect(button.textContent).toBe('idle');
			expect(button.getAttribute('data-scope')).toBe('nested');

			(r.find('#field') as HTMLInputElement).value = 'edited';
			flushSync(() => form.requestSubmit(button));
			await tick();
			expect(submittedDraft).toBe('edited');
			expect(button.textContent).toBe('pending:edited');

			d.resolve();
			await settle();
			expect(button.textContent).toBe('idle');
		} finally {
			d.resolve();
			await settle();
			r.unmount();
			outerTarget.remove();
			innerTarget.remove();
		}
	});

	it('crosses a committed parent portal before resolving a nested frontier portal', async () => {
		const d = deferred();
		let showPortal!: () => void;
		let submittedDraft: FormDataEntryValue | null = null;
		const outerTarget = document.createElement('form');
		outerTarget.id = 'other-form';
		const innerTarget = document.createElement('aside');
		document.body.append(outerTarget, innerTarget);
		const r = mount(NestedFrontierPortaledFormWithStatus, {
			action: (data: FormData) => {
				submittedDraft = data.get('draft');
				return d.promise;
			},
			outerTarget,
			innerTarget,
			expose: (show: () => void) => (showPortal = show),
		});
		try {
			flushSync(() => {});
			const form = r.find('#save-form') as HTMLFormElement;
			expect(outerTarget.querySelector('#outer-portal-host')).not.toBeNull();
			expect(innerTarget.querySelector('#portal-status')).toBeNull();

			flushSync(() => showPortal());
			const button = innerTarget.querySelector('#portal-status') as HTMLButtonElement;
			expect(button.form).toBe(form);
			expect(button.textContent).toBe('idle');
			expect(button.getAttribute('data-scope')).toBe('nested-frontier');

			(r.find('#field') as HTMLInputElement).value = 'edited';
			flushSync(() => form.requestSubmit(button));
			await tick();
			expect(submittedDraft).toBe('edited');
			expect(button.textContent).toBe('pending:edited');

			d.resolve();
			await settle();
			expect(button.textContent).toBe('idle');
		} finally {
			d.resolve();
			await settle();
			r.unmount();
			outerTarget.remove();
			innerTarget.remove();
		}
	});

	it('uses a nearer form root that is still inside the source frontier', async () => {
		const d = deferred();
		let showPortal!: () => void;
		let submittedDraft: FormDataEntryValue | null = null;
		const target = document.createElement('aside');
		document.body.appendChild(target);
		const r = mount(FrontierInnerFormPortaledFormWithStatus, {
			action: (data: FormData) => {
				submittedDraft = data.get('draft');
				return d.promise;
			},
			target,
			expose: (show: () => void) => (showPortal = show),
		});
		try {
			flushSync(() => {});
			const outerForm = r.find('#outer-form') as HTMLFormElement;
			expect(r.container.querySelector('#save-form')).toBeNull();

			flushSync(() => showPortal());
			const form = r.find('#save-form') as HTMLFormElement;
			const button = target.querySelector('#portal-status') as HTMLButtonElement;
			expect(outerForm.contains(form)).toBe(true);
			expect(button.form).toBe(form);
			expect(button.textContent).toBe('idle');
			expect(button.getAttribute('data-scope')).toBe('frontier-inner-form');

			(r.find('#field') as HTMLInputElement).value = 'edited';
			flushSync(() => form.requestSubmit(button));
			await tick();
			expect(submittedDraft).toBe('edited');
			expect(button.textContent).toBe('pending:edited');

			d.resolve();
			await settle();
			expect(button.textContent).toBe('idle');
		} finally {
			d.resolve();
			await settle();
			r.unmount();
			target.remove();
		}
	});

	it('walks the detached host before falling back past a wrapper form', async () => {
		const d = deferred();
		let showPortal!: () => void;
		let submittedDraft: FormDataEntryValue | null = null;
		const target = document.createElement('aside');
		document.body.appendChild(target);
		const r = mount(FrontierWrappedInnerFormPortaledFormWithStatus, {
			action: (data: FormData) => {
				submittedDraft = data.get('draft');
				return d.promise;
			},
			target,
			expose: (show: () => void) => (showPortal = show),
		});
		try {
			flushSync(() => {});
			const outerForm = r.find('#outer-form') as HTMLFormElement;
			expect(r.container.querySelector('#save-form')).toBeNull();

			flushSync(() => showPortal());
			const form = r.find('#save-form') as HTMLFormElement;
			const button = target.querySelector('#portal-status') as HTMLButtonElement;
			expect(outerForm.contains(form)).toBe(true);
			expect(button.form).toBe(form);
			expect(button.textContent).toBe('idle');
			expect(button.getAttribute('data-scope')).toBe('wrapped-frontier-inner-form');

			(r.find('#field') as HTMLInputElement).value = 'edited';
			flushSync(() => form.requestSubmit(button));
			await tick();
			expect(submittedDraft).toBe('edited');
			expect(button.textContent).toBe('pending:edited');

			d.resolve();
			await settle();
			expect(button.textContent).toBe('idle');
		} finally {
			d.resolve();
			await settle();
			r.unmount();
			target.remove();
		}
	});

	it('keeps the form pending until ALL queued submits drain', async () => {
		// useActionState runs dispatches sequentially; each dispatch's promise
		// resolves when THAT action finishes, not when the whole queue drains. A
		// rapid second submit must keep the form's status pending until both
		// actions complete — not flip to idle after the first.
		const d1 = deferred();
		const d2 = deferred();
		const promises = [d1.promise, d2.promise];
		const action = (_p: any, _fd: FormData) => promises.shift();
		const r = mount(FormWithStatus, { action });
		flushSync(() => {});
		submit(r.container); // submit 1 (action 1 runs)
		submit(r.container); // submit 2 (action 2 queued behind action 1)
		expect(r.find('#status').textContent).toBe('pending:post');

		// Drain fully with action 2's promise STILL unresolved: action 1's settle
		// has fired, but action 2 is in flight → status MUST stay pending.
		d1.resolve();
		await settle();
		expect(r.find('#status').textContent).toBe('pending:post');

		d2.resolve();
		await settle();
		expect(r.find('#status').textContent).toBe('idle');
		r.unmount();
	});

	it('re-resolves an ancestor form that appears after the first render', async () => {
		// First render has no ancestor form (idle). After we wrap the probe in a
		// <form> and re-render, the hook must re-resolve + subscribe to it — not
		// stay stuck on the cached null from the first render.
		let force!: () => void;
		const r = mount(StatusProbe, { expose: (f: () => void) => (force = f) });
		flushSync(() => {});
		expect(r.find('#probe').textContent).toBe('idle');

		// Insert a <form> between the root container and #wrap, so it becomes the
		// probe's nearest ANCESTOR form (and submit events bubble to the root).
		const wrap = r.find('#wrap');
		const form = document.createElement('form');
		r.container.insertBefore(form, wrap);
		form.appendChild(wrap);
		const d = deferred();
		setFormAction(form as any, 'action', () => d.promise, undefined);

		// Re-render → useFormStatus re-resolves + subscribes to the new ancestor form.
		flushSync(() => force());
		// A submit flips the form's status; the now-subscribed probe reflects it.
		flushSync(() =>
			form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true })),
		);
		expect(r.find('#probe').textContent).toBe('pending');

		// Resolve + drain so the in-flight transition doesn't leak into later tests.
		d.resolve();
		await settle();
		r.unmount();
	});

	it.each([
		['as the root', SelfFormStatus],
		['as a child', NestedSelfFormStatus],
	])('ignores a form rendered by the same component %s (no ancestor form)', async (_, App) => {
		let captured: any;
		const d = deferred();
		const props = { action: () => d.promise, expose: (s: any) => (captured = s) };
		const r = mount(App, props);
		// The second render finds the component's range already in the document.
		r.update(App, { ...props, expose: (s: any) => (captured = s) });
		// The hook's component renders the form, so there is NO ancestor form →
		// idle, even while that form's own action is pending.
		submit(r.container);
		await tick();
		expect(r.find('#self').textContent).toBe('idle');
		expect(captured.pending).toBe(false);
		d.resolve();
		await settle();
		r.unmount();
	});

	it('clears pending when a raw form action throws synchronously', async () => {
		const err = new Error('boom');
		const errors: unknown[] = [];
		const onError = (event: ErrorEvent) => {
			errors.push(event.error);
			event.preventDefault();
		};
		window.addEventListener('error', onError);
		const r = mount(RawFormWithStatus, {
			action: () => {
				throw err;
			},
		});
		try {
			flushSync(() => {});
			expect(r.find('#status').textContent).toBe('idle');
			submit(r.container);
			await tick();
			expect(r.find('#status').textContent).toBe('idle');
			expect(errors).toEqual([err]);
		} finally {
			r.unmount();
			window.removeEventListener('error', onError);
		}
	});
});

describe('useOptimistic', () => {
	it('keeps optimistic state through a Suspense hold owned by its action', async () => {
		const save = deferred();
		const detail = suspenseGate();
		const r = mount(OptimisticSuspenseAction, {
			save: save.promise,
			read: detail.read,
			suspend: true,
		});
		try {
			flushSync(() => (r.find('#save') as HTMLButtonElement).click());
			await tick();
			expect(r.find('#optimistic').textContent).toBe('1');
			expect(r.find('#pending').textContent).toBe('pending');
			flushSync(() => (r.find('#bare-add') as HTMLButtonElement).click());
			await tick();
			expect(r.find('#optimistic').textContent).toBe('1');

			save.resolve();
			await settle();
			expect(r.find('#saved').textContent).toBe('0');
			expect(r.find('#optimistic').textContent).toBe('1');
			expect(r.find('#pending').textContent).toBe('pending');
			expect(r.find('#detail').textContent).toBe('old');

			detail.resolve();
			await settle();
			expect(r.find('#saved').textContent).toBe('1');
			expect(r.find('#optimistic').textContent).toBe('1');
			expect(r.find('#pending').textContent).toBe('idle');
			expect(r.find('#detail').textContent).toBe('ready');
		} finally {
			save.resolve();
			detail.resolve();
			await settle();
			r.unmount();
		}
	});

	it('reverts its optimistic state while an unrelated root stays suspended', async () => {
		const save = deferred();
		const detail = suspenseGate();
		const unrelated = mount(SuspendedTransitionRoot, { read: detail.read });
		const r = mount(OptimisticSuspenseAction, {
			save: save.promise,
			read: detail.read,
			suspend: false,
		});
		try {
			flushSync(() => (unrelated.find('#navigate') as HTMLButtonElement).click());
			await settle();
			expect(unrelated.find('#pending').textContent).toBe('pending');
			expect(unrelated.find('#detail').textContent).toBe('old');

			flushSync(() => (r.find('#save') as HTMLButtonElement).click());
			await tick();
			expect(r.find('#optimistic').textContent).toBe('1');
			expect(r.find('#pending').textContent).toBe('pending');

			save.resolve();
			await settle();
			expect(r.find('#saved').textContent).toBe('1');
			expect(r.find('#optimistic').textContent).toBe('1');
			expect(r.find('#pending').textContent).toBe('idle');
			expect(unrelated.find('#pending').textContent).toBe('pending');

			detail.resolve();
			await settle();
			expect(unrelated.find('#pending').textContent).toBe('idle');
			expect(unrelated.find('#detail').textContent).toBe('ready');
		} finally {
			save.resolve();
			detail.resolve();
			await settle();
			r.unmount();
			unrelated.unmount();
		}
	});

	for (const urgentFirst of [false, true]) {
		it(`reverts with the held work a timeout fallback lets commit (urgentFirst=${urgentFirst})`, async () => {
			vi.useFakeTimers({ shouldAdvanceTime: false });
			const previousTimeout = getTransitionFallbackTimeout();
			setTransitionFallbackTimeout(100);
			const save = deferred();
			const detail = suspenseGate();
			const r = mount(OptimisticSuspenseAction, {
				save: save.promise,
				read: detail.read,
				suspend: true,
			});
			try {
				r.click('#save');
				await act(async () => {
					save.resolve();
					await save.promise;
				});
				expect(r.find('#saved').textContent).toBe('0');
				expect(r.find('#optimistic').textContent).toBe('1');

				if (urgentFirst) {
					// An urgent render folds the released work before its retry task.
					vi.advanceTimersByTime(100);
				} else await act(() => vi.advanceTimersByTimeAsync(100));
				expect(r.find('#fallback').textContent).toBe('loading');
				expect(r.find('#pending').textContent).toBe('pending');

				r.click('#bare-add');
				expect(r.find('#saved').textContent).toBe('1');
				expect(r.find('#optimistic').textContent).toBe('11');
				await act(() => {});
				expect(r.find('#saved').textContent).toBe('1');
				expect(r.find('#optimistic').textContent).toBe('1');
				expect(r.find('#pending').textContent).toBe('pending');

				await act(async () => {
					detail.resolve();
				});
				expect(r.find('#detail').textContent).toBe('ready');
				expect(r.find('#optimistic').textContent).toBe('1');
				expect(r.find('#pending').textContent).toBe('idle');
			} finally {
				save.resolve();
				detail.resolve();
				await act(() => {});
				r.unmount();
				setTransitionFallbackTimeout(previousTimeout);
				vi.useRealTimers();
			}
		});
	}

	it('reverts without a cross-render warning when an urgent update supersedes its transition', async () => {
		const fulfilled = (value: string) =>
			Object.assign(Promise.resolve(value), { status: 'fulfilled', value });
		const next = deferred<string>();
		const r = mount(OptimisticSupersededTransition, {
			initial: fulfilled('A'),
			next: next.promise,
			urgent: fulfilled('C'),
		});
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			flushSync(() => (r.find('#transition') as HTMLButtonElement).click());
			await settle();
			expect(r.find('#value').textContent).toBe('A');
			expect(r.find('#optimistic').textContent).toBe('1');
			expect(r.find('#pending').textContent).toBe('pending');

			flushSync(() => (r.find('#urgent') as HTMLButtonElement).click());
			await settle();
			expect(r.find('#value').textContent).toBe('C');
			// The superseded transition's retry finishes its batch in a task.
			await act(() => {});
			expect(r.find('#optimistic').textContent).toBe('0');
			expect(r.find('#pending').textContent).toBe('idle');
			expect(
				error.mock.calls.filter(([message]) =>
					String(message).includes('Cannot update a component'),
				),
			).toEqual([]);
		} finally {
			error.mockRestore();
			next.resolve('B');
			await settle();
			r.unmount();
		}
	});

	it('shows the optimistic value during the action, then converges to real state', async () => {
		const d = deferred();
		const r = mount(OptimisticForm, { initial: ['x'], action: () => d.promise });
		flushSync(() => {});
		expect(r.find('#list').textContent).toBe('x');

		(r.find('#field') as HTMLInputElement).value = 'y';
		submit(r.container);
		// The action (and its addOptimistic call) runs on a microtask after submit;
		// once it does, the optimistic value (with the '?' marker) shows while pending.
		await tick();
		expect(r.find('#list').textContent).toBe('x,y?');

		d.resolve();
		await settle();
		// Real committed state (no '?'), optimistic queue cleared.
		expect(r.find('#list').textContent).toBe('x,y');
		r.unmount();
	});

	it('shows briefly then reverts when addOptimistic is called OUTSIDE a transition', async () => {
		// Bare addOptimistic (no Action): the value shows for one render, then the
		// queue self-clears on a microtask — it must NOT stay stuck waiting for a
		// transition that never comes.
		const r = mount(BareOptimistic, { initial: ['a'] });
		flushSync(() => {});
		expect(r.find('#list').textContent).toBe('a');

		flushSync(() => (r.find('#add') as HTMLElement).click());
		expect(r.find('#list').textContent).toBe('a,x'); // shown briefly

		await tick();
		expect(r.find('#list').textContent).toBe('a'); // reverted, not stuck
		r.unmount();
	});

	it('applies a function action as an updater when no reducer is given', async () => {
		// React falls back to basicStateReducer: each function action receives the
		// pending optimistic state, so updaters chain and rebase onto a new
		// passthrough instead of being stored as the optimistic state.
		const d = deferred();
		let add!: (action: number | ((pending: number) => number)) => void;
		const expose = (fn: typeof add) => {
			add = fn;
		};
		const r = mount(OptimisticCounter, { count: 0, expose });
		expect(r.find('#count').textContent).toBe('0');

		startTransition(async () => {
			add((n) => n + 1);
			add((n) => n * 10);
			await d.promise;
		});
		await tick();
		expect(r.find('#count').textContent).toBe('10');

		r.update(OptimisticCounter, { count: 2, expose });
		expect(r.find('#count').textContent).toBe('30');

		d.resolve();
		await settle();
		expect(r.find('#count').textContent).toBe('2');
		r.unmount();
	});

	it('replaces the pending state with a non-function action when no reducer is given', async () => {
		const d = deferred();
		let add!: (action: number | ((pending: number) => number)) => void;
		const expose = (fn: typeof add) => {
			add = fn;
		};
		const r = mount(OptimisticCounter, { count: 0, expose });

		startTransition(async () => {
			add(5);
			add((n) => n + 1);
			await d.promise;
		});
		await tick();
		expect(r.find('#count').textContent).toBe('6');

		// The replacement ignores the passthrough, so a new one does not show through.
		r.update(OptimisticCounter, { count: 2, expose });
		expect(r.find('#count').textContent).toBe('6');

		d.resolve();
		await settle();
		expect(r.find('#count').textContent).toBe('2');
		r.unmount();
	});
});

describe('direct dispatch (formAction(payload) outside a form)', () => {
	it('still diagnoses an async dispatch after an intercepted form action has finished', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const form = mount(ActionForm, { action: async () => 'submitted', initial: 'init' });
		const direct = mount(DirectAction, { action: async () => 42, initial: 0, payload: 1 });
		try {
			submit(form.container);
			await settle();
			expect(error).not.toHaveBeenCalled();
			flushSync(() => (direct.find('#run') as HTMLElement).click());
			await settle();
			expect(direct.find('#state').textContent).toBe('42');
			expect(error).toHaveBeenCalledWith(expect.stringContaining('outside a transition or action'));
		} finally {
			form.unmount();
			direct.unmount();
			error.mockRestore();
		}
	});

	it('runs the action with the raw payload and tracks isPending', async () => {
		const d = deferred();
		const action = (_prev: number, payload: number) => d.promise.then(() => payload * 2);
		const r = mount(DirectAction, { action, initial: 0, payload: 21 });
		flushSync(() => {});
		r.find('#run');
		flushSync(() => (r.find('#run') as HTMLElement).click());
		expect(r.find('#pending').textContent).toBe('pending');

		d.resolve();
		await settle();
		expect(r.find('#state').textContent).toBe('42');
		expect(r.find('#pending').textContent).toBe('idle');
		r.unmount();
	});

	it('clears isPending when a useActionState action throws synchronously', async () => {
		// A synchronously-throwing action inside useActionState's dispatch must not
		// leave isPending stuck true (the throw escaping startTransition before
		// `finish` runs would otherwise wedge pendingCount forever) — and it reports
		// the error.
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const err = new Error('boom');
		const action = () => {
			throw err;
		};
		const r = mount(DirectAction, { action, initial: 0, payload: 1 });
		flushSync(() => {});
		expect(r.find('#pending').textContent).toBe('idle');

		flushSync(() => (r.find('#run') as HTMLElement).click());
		// isPending flips true synchronously at dispatch…
		expect(r.find('#pending').textContent).toBe('pending');

		// …then the action runs on a microtask and throws; pending must clear.
		await settle();
		expect(r.find('#pending').textContent).toBe('idle'); // not stuck on pending
		expect(spy).toHaveBeenCalledWith(err);
		spy.mockRestore();
		r.unmount();
	});

	it('keeps the dispatch queue threading after a synchronous throw', async () => {
		// The chain must not reject-and-stall: a second dispatch after a throwing
		// one still runs and commits (the throw resolved the chain with prior state).
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		let calls = 0;
		const action = (prev: number, payload: number) => {
			calls++;
			if (calls === 1) throw new Error('first blows up');
			return prev + payload; // second dispatch threads prior (unchanged) state
		};
		const r = mount(DirectAction, { action, initial: 10, payload: 5 });
		flushSync(() => {});
		flushSync(() => (r.find('#run') as HTMLElement).click()); // throws
		flushSync(() => (r.find('#run') as HTMLElement).click()); // must still run
		await settle();
		expect(calls).toBe(2);
		expect(r.find('#state').textContent).toBe('15'); // 10 + 5 committed
		expect(r.find('#pending').textContent).toBe('idle');
		spy.mockRestore();
		r.unmount();
	});
});

describe('raw <form action={fn}> auto-reset', () => {
	it('resets uncontrolled fields after a successful submit', async () => {
		const d = deferred();
		let received: string | null = null;
		const action = (fd: FormData) => {
			received = String(fd.get('field'));
			return d.promise;
		};
		const r = mount(RawForm, { action });
		flushSync(() => {});
		const field = r.find('#field') as HTMLInputElement;
		field.value = 'typed';
		submit(r.container);
		expect(received).toBe('typed'); // action got the FormData

		d.resolve();
		await settle();
		// Uncontrolled input reset to its (empty) default on success.
		expect((r.find('#field') as HTMLInputElement).value).toBe('');
		r.unmount();
	});
});

describe('<form action> function → string → function toggle', () => {
	it('re-wires submit interception after the action flips back to a function', async () => {
		// Regression: switching fn→string cleared `$$submit` but left `$$formSubmitWired`
		// set, so flipping BACK to a function skipped the wire-once guard and submit
		// interception stayed permanently dead for the form.
		const calls: string[] = [];
		const fn1 = () => {
			calls.push('fn1');
		};
		const fn2 = () => {
			calls.push('fn2');
		};
		const r = mount(RawForm, { action: fn1 });
		flushSync(() => {});
		submit(r.container);
		await settle();
		expect(calls).toEqual(['fn1']);

		// → string action: native semantics, the intercepting handler is cleared.
		r.update(RawForm, { action: '/native' });
		const form = r.container.querySelector('form')!;
		expect(form.getAttribute('action')).toBe('/native');

		// → function again: interception must be re-installed.
		r.update(RawForm, { action: fn2 });
		submit(r.container);
		await settle();
		expect(calls).toEqual(['fn1', 'fn2']);
		r.unmount();
	});
});
