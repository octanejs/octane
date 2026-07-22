import { describe, expect, it } from 'vitest';
import {
	createContext,
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	memo,
	startTransition,
	universalActivity,
	universalComponent,
	universalContext,
	universalPlan,
	universalProps,
	universalTry,
	universalValue,
	use,
	useContext,
	useDeferredValue,
	useLayoutEffect,
	useMemo,
	useReducer,
	useState,
	useTransition,
	type ObjectHostContainer,
	type UniversalAsyncCommitTransport,
	type UniversalRenderable,
} from '../src/universal.js';

interface Deferred<T> {
	readonly promise: Promise<T>;
	resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((accept) => {
		resolve = accept;
	});
	return { promise, resolve };
}

function fulfilled<T>(value: T): Promise<T> {
	const promise = Promise.resolve(value) as Promise<T> & {
		status?: 'fulfilled';
		value?: T;
	};
	promise.status = 'fulfilled';
	promise.value = value;
	return promise;
}

async function drainMicrotasks(turns = 12): Promise<void> {
	for (let turn = 0; turn < turns; turn++) await Promise.resolve();
}

function objectRoot() {
	const container = createObjectContainer();
	const root = createUniversalRoot(container, createObjectDriver());
	return { container, root };
}

function controlledObjectRoot() {
	const container = createObjectContainer();
	const scheduled: Array<() => void> = [];
	const root = createUniversalRoot(container, createObjectDriver(), {
		scheduleMicrotask(callback) {
			scheduled.push(callback);
		},
	});
	return {
		container,
		root,
		scheduled,
		flushNext() {
			const callback = scheduled.shift();
			if (callback === undefined) throw new Error('Expected scheduled universal work.');
			callback();
		},
		flushAll() {
			for (let count = 0; scheduled.length > 0; count++) {
				if (count === 50) throw new Error('Controlled universal scheduler did not stabilize.');
				scheduled.shift()!();
			}
		},
	};
}

function controlledTransportObjectRoot() {
	const container = createObjectContainer();
	const objectDriver = createObjectDriver();
	const driver = {
		...objectDriver,
		capabilities: { ...objectDriver.capabilities, localHostCallbacks: false },
	};
	const scheduled: Array<() => void> = [];
	let nextFailure: 'pre-ack' | 'post-ack' | null = null;
	let preAckObservation: Readonly<Record<string, unknown>> | null = null;
	let postAckObservation: Readonly<Record<string, unknown>> | null = null;
	const transport: UniversalAsyncCommitTransport<ObjectHostContainer> = {
		mode: 'async',
		prepareBatch(host, batch, identity) {
			const prepared = driver.prepareBatch(host, batch, {
				invokeLocalCallback() {
					throw new Error('The scheduling transport fixture has no local callbacks.');
				},
			});
			return {
				async apply(acknowledge) {
					const failure = nextFailure;
					nextFailure = null;
					if (failure === 'pre-ack') {
						preAckObservation = values(host);
						throw new Error('transition rejected before acknowledgement');
					}
					prepared.apply();
					acknowledge({ ...identity, type: 'ack' });
					if (failure === 'post-ack') {
						postAckObservation = values(host);
						throw new Error('transition fault after acknowledgement');
					}
				},
				afterAccept: prepared.afterAccept,
				abort: prepared.abort,
			};
		},
	};
	const root = createUniversalRoot(container, driver, {
		transport,
		scheduleMicrotask(callback) {
			scheduled.push(callback);
		},
	});
	return {
		container,
		root,
		scheduled,
		failNext(kind: 'pre-ack' | 'post-ack') {
			nextFailure = kind;
		},
		failureObservations() {
			return { preAck: preAckObservation, postAck: postAckObservation };
		},
		flushNext() {
			const callback = scheduled.shift();
			if (callback === undefined) throw new Error('Expected scheduled universal work.');
			callback();
		},
	};
}

const nodePlan = universalPlan('object', {
	kind: 'host',
	type: 'node',
	propsSlot: 0,
});

function node(id: string, value: unknown): UniversalRenderable {
	return universalValue(nodePlan, [
		universalProps([
			['set', 'id', id],
			['set', 'value', value],
		]),
	]);
}

function values(container: ObjectHostContainer): Readonly<Record<string, unknown>> {
	return Object.fromEntries(container.children.map((child) => [child.props.id, child.props.value]));
}

describe('universal transition scheduling', () => {
	it('publishes pending urgently and retains accepted content until a suspended transition resolves', async () => {
		const first = fulfilled('first');
		const second = deferred<string>();
		let begin!: () => void;
		const Scene = defineUniversalComponent('object', () => {
			const [resource, setResource] = useState<Promise<string>>(first, 'resource');
			const [pending, start] = useTransition('transition');
			begin = () => start(() => setResource(second.promise));
			return [
				node('pending', pending),
				universalTry(
					() => node('content', use(resource)),
					() => node('fallback', 'loading'),
				),
			];
		});
		const { container, root } = objectRoot();

		root.render(Scene, undefined);
		expect(values(container)).toEqual({ pending: false, content: 'first' });

		begin();
		await drainMicrotasks();
		expect(values(container)).toEqual({ pending: true, content: 'first' });

		second.resolve('second');
		await drainMicrotasks();
		expect(values(container)).toEqual({ pending: false, content: 'second' });
		root.unmount();
	});

	it('lets an urgent update supersede suspended transition work and ignores its stale retry', async () => {
		const first = fulfilled('first');
		const second = deferred<string>();
		const third = fulfilled('third');
		let begin!: () => void;
		let supersede!: () => void;
		const Scene = defineUniversalComponent('object', () => {
			const [resource, setResource] = useState<Promise<string>>(first, 'resource');
			const [pending, start] = useTransition('transition');
			begin = () => start(() => setResource(second.promise));
			supersede = () => setResource(third);
			return [
				node('pending', pending),
				universalTry(
					() => node('content', use(resource)),
					() => node('fallback', 'loading'),
				),
			];
		});
		const { container, root } = objectRoot();

		root.render(Scene, undefined);
		begin();
		await drainMicrotasks();
		expect(values(container)).toEqual({ pending: true, content: 'first' });

		supersede();
		await drainMicrotasks();
		expect(values(container)).toEqual({ pending: false, content: 'third' });
		const acceptedCommits = container.commits.length;

		second.resolve('second');
		await drainMicrotasks();
		expect(values(container)).toEqual({ pending: false, content: 'third' });
		expect(container.commits).toHaveLength(acceptedCommits);
		root.unmount();
	});

	it('rebases a newer transition over an older suspended transition', async () => {
		const first = fulfilled('first');
		const second = deferred<string>();
		const third = fulfilled('third');
		let showSecond!: () => void;
		let showThird!: () => void;
		const Scene = defineUniversalComponent('object', () => {
			const [resource, setResource] = useState<Promise<string>>(first, 'resource');
			const [pending, start] = useTransition('transition');
			showSecond = () => start(() => setResource(second.promise));
			showThird = () => start(() => setResource(third));
			return [
				node('pending', pending),
				universalTry(
					() => node('content', use(resource)),
					() => node('fallback', 'loading'),
				),
			];
		});
		const { container, root, flushAll } = controlledObjectRoot();

		root.render(Scene, undefined);
		showSecond();
		flushAll();
		expect(values(container)).toEqual({ pending: true, content: 'first' });

		showThird();
		flushAll();
		expect(values(container)).toEqual({ pending: false, content: 'third' });
		const acceptedCommits = container.commits.length;

		second.resolve('second');
		await Promise.resolve();
		flushAll();
		expect(values(container)).toEqual({ pending: false, content: 'third' });
		expect(container.commits).toHaveLength(acceptedCommits);
		root.unmount();
	});

	it('keeps promoted transition work isolated when unrelated urgent work arrives', async () => {
		const first = fulfilled('first');
		const second = deferred<string>();
		let begin!: () => void;
		let updateUrgent!: () => void;
		const Scene = defineUniversalComponent('object', () => {
			const [resource, setResource] = useState<Promise<string>>(first, 'resource');
			const [urgent, setUrgent] = useState(0, 'urgent');
			const [pending, start] = useTransition('transition');
			begin = () => start(() => setResource(second.promise));
			updateUrgent = () => setUrgent((value) => value + 1);
			return [
				node('pending', pending),
				node('urgent', urgent),
				universalTry(
					() => node('content', use(resource)),
					() => node('fallback', 'loading'),
				),
			];
		});
		const { container, root, scheduled, flushNext, flushAll } = controlledObjectRoot();

		root.render(Scene, undefined);
		const acceptedContent = container.children[2];
		begin();
		flushNext(); // Publish the urgent pending signal.
		flushNext(); // Promote the staged transition and queue its render.
		updateUrgent();
		flushNext(); // The already-queued render must remain urgent-only.

		expect(values(container)).toEqual({ pending: true, urgent: 1, content: 'first' });
		expect(container.children).toHaveLength(3);
		expect(container.children[2]).toBe(acceptedContent);
		expect(acceptedContent.visible).toBe(true);
		expect(scheduled.length).toBeGreaterThan(0);

		flushAll(); // The transition retry suspends without publishing a fallback.
		expect(values(container)).toEqual({ pending: true, urgent: 1, content: 'first' });
		expect(acceptedContent.visible).toBe(true);

		second.resolve('second');
		await Promise.resolve();
		flushAll();
		await Promise.resolve();
		flushAll();
		expect(values(container)).toEqual({ pending: false, urgent: 1, content: 'second' });
		root.unmount();
	});

	it('keeps an explicit root render urgent while transition work is queued', () => {
		const first = fulfilled('first');
		const second = deferred<string>();
		let begin!: () => void;
		const Scene = defineUniversalComponent('object', (props: { label: string }) => {
			const [resource, setResource] = useState<Promise<string>>(first, 'resource');
			const [pending, start] = useTransition('transition');
			begin = () => start(() => setResource(second.promise));
			return [
				node('pending', pending),
				node('label', props.label),
				universalTry(
					() => node('content', use(resource)),
					() => node('fallback', 'loading'),
				),
			];
		});
		const { container, root, scheduled, flushNext } = controlledObjectRoot();

		root.render(Scene, { label: 'A' });
		begin();
		flushNext(); // Publish pending urgently.
		flushNext(); // Promote the transition, leaving its render queued.
		const attempt = root.render(Scene, { label: 'B' });

		expect(attempt.status).toBe('committed');
		expect(values(container)).toEqual({ pending: true, label: 'B', content: 'first' });
		expect(scheduled.length).toBeGreaterThan(0);
		root.unmount();
	});

	it('rebases queued transition work onto a newer suspended explicit render', async () => {
		const first = fulfilled('A');
		const second = deferred<string>();
		let begin!: () => void;
		const Scene = defineUniversalComponent('object', (props: { resource: Promise<string> }) => {
			const [count, setCount] = useState(0, 'count');
			begin = () => startTransition(() => setCount(1));
			return [node('content', use(props.resource)), node('count', count)];
		});
		const { container, root, flushNext, flushAll } = controlledObjectRoot();

		root.render(Scene, { resource: first });
		begin();
		flushNext(); // Promote the transition, leaving its render queued.
		expect(root.render(Scene, { resource: second.promise }).status).toBe('suspended');
		flushAll(); // The transition retry must preserve the newer explicit props.

		second.resolve('B');
		await Promise.resolve();
		flushAll();
		await Promise.resolve();
		flushAll();
		expect(values(container)).toEqual({ content: 'B', count: 1 });
		root.unmount();
	});

	it('keeps newer suspended props when urgent state interrupts a transition retry', async () => {
		const first = fulfilled('A');
		const second = deferred<string>();
		let begin!: () => void;
		let markUrgent!: () => void;
		const Scene = defineUniversalComponent('object', (props: { resource: Promise<string> }) => {
			const [count, setCount] = useState(0, 'count');
			const [urgent, setUrgent] = useState(false, 'urgent');
			begin = () => startTransition(() => setCount(1));
			markUrgent = () => setUrgent(true);
			return [node('content', use(props.resource)), node('count', count), node('urgent', urgent)];
		});
		const { container, root, flushNext, flushAll } = controlledObjectRoot();

		root.render(Scene, { resource: first });
		begin();
		flushNext(); // Promote the transition, leaving its render queued.
		expect(root.render(Scene, { resource: second.promise }).status).toBe('suspended');
		flushAll(); // Replace the urgent suspension with a transition retry for the same props.

		markUrgent();
		flushAll();
		expect(values(container)).toEqual({ content: 'A', count: 0, urgent: false });

		second.resolve('B');
		await Promise.resolve();
		flushAll();
		await Promise.resolve();
		flushAll();
		expect(values(container)).toEqual({ content: 'B', count: 1, urgent: true });
		root.unmount();
	});

	it('does not eager-bail an urgent value equal only to pending transition state', () => {
		const first = fulfilled('first');
		const second = deferred<string>();
		let begin!: () => void;
		let revealUrgently!: () => void;
		const Scene = defineUniversalComponent('object', () => {
			const [resource, setResource] = useState<Promise<string>>(first, 'resource');
			const [pending, start] = useTransition('transition');
			begin = () => start(() => setResource(second.promise));
			revealUrgently = () => setResource(second.promise);
			return [
				node('pending', pending),
				universalTry(
					() => node('content', use(resource)),
					() => node('fallback', 'loading'),
				),
			];
		});
		const { container, root, flushAll } = controlledObjectRoot();

		root.render(Scene, undefined);
		begin();
		flushAll();
		expect(values(container)).toEqual({ pending: true, content: 'first' });

		revealUrgently();
		flushAll();
		expect(values(container)).toEqual({
			pending: true,
			content: 'first',
			fallback: 'loading',
		});
		expect(container.children.find((child) => child.props.id === 'content')?.visible).toBe(false);
		expect(container.children.find((child) => child.props.id === 'fallback')?.visible).toBe(true);
		root.unmount();
	});

	it('does not eager-bail an urgent value that must rebase a queued transition', () => {
		let begin!: () => void;
		let keepZero!: () => void;
		const Scene = defineUniversalComponent('object', () => {
			const [count, setCount] = useState(0, 'count');
			const [pending, start] = useTransition('transition');
			begin = () => start(() => setCount(1));
			keepZero = () => setCount(0);
			return [node('pending', pending), node('count', count)];
		});
		const { container, root, flushNext, flushAll } = controlledObjectRoot();

		root.render(Scene, undefined);
		begin();
		flushNext(); // Publish pending urgently.
		flushNext(); // Promote the transition, leaving its render queued.
		keepZero();
		flushAll();
		expect(values(container)).toEqual({ pending: false, count: 0 });
		root.unmount();
	});

	it('settles an inactive conditional transition without losing urgent rebase ordering', () => {
		let begin!: () => void;
		let addTen!: () => void;
		let hide!: () => void;
		let showAgain!: () => void;
		const Scene = defineUniversalComponent('object', () => {
			const [show, setShow] = useState(true, 'show');
			const [pending, start] = useTransition('transition');
			hide = () => setShow(false);
			showAgain = () => setShow(true);
			const output = [node('pending', pending), node('show', show)];
			if (show) {
				const [conditional, setConditional] = useState(0, 'conditional');
				begin = () => start(() => setConditional((value) => value + 1));
				addTen = () => setConditional((value) => value + 10);
				output.push(node('conditional', conditional));
			}
			return output;
		});
		const { container, root, scheduled, flushNext, flushAll } = controlledObjectRoot();

		root.render(Scene, undefined);
		begin();
		addTen();
		flushNext(); // Publish pending and the urgent update while skipping the transition lane.
		expect(values(container)).toEqual({ pending: true, show: true, conditional: 10 });

		hide();
		flushNext(); // Promote the transition behind the already-queued urgent hide.
		flushNext(); // Commit the hide without visiting the conditional hook.
		flushAll();
		expect(values(container)).toEqual({ pending: false, show: false });
		expect(scheduled).toHaveLength(0);

		showAgain();
		flushAll();
		expect(values(container)).toEqual({ pending: false, show: true, conditional: 11 });
		root.unmount();
	});

	it('preserves detached conditional rebases when a newer transition is canceled', () => {
		let beginFirst!: () => void;
		let setTen!: () => void;
		let hide!: () => void;
		let showAgain!: () => void;
		let cancelNewer!: () => void;
		let setConditional!: (value: number) => void;
		const Scene = defineUniversalComponent('object', () => {
			const [show, setShow] = useState(true, 'show');
			const [fail, setFail] = useState(false, 'fail');
			hide = () => setShow(false);
			showAgain = () => setShow(true);
			cancelNewer = () =>
				startTransition(() => {
					setConditional(100);
					setFail(true);
				});
			if (fail) throw new Error('cancel newer transition');
			const output = [node('show', show)];
			if (show) {
				const [conditional, updateConditional] = useState(0, 'conditional');
				setConditional = updateConditional;
				beginFirst = () => startTransition(() => updateConditional(1));
				setTen = () => updateConditional(10);
				output.push(node('conditional', conditional));
			}
			return output;
		});
		const { container, root, flushNext, flushAll } = controlledObjectRoot();

		root.render(Scene, undefined);
		beginFirst();
		setTen();
		flushNext(); // Promote behind the queued urgent update.
		flushNext(); // Publish 10 while retaining the older transition as a rebase lane.
		hide();
		flushNext(); // Hide urgently before the transition attempt.
		flushAll(); // Detach the inactive first transition without losing its ordering metadata.

		cancelNewer();
		expect(() => flushAll()).toThrow('cancel newer transition');
		showAgain();
		flushAll();
		expect(values(container)).toEqual({ show: true, conditional: 10 });
		root.unmount();
	});

	it('runs newly promoted transition updates inside hidden Activity trees', () => {
		let setHiddenCount!: (value: number) => void;
		let begin!: () => void;
		const Child = defineUniversalComponent('object', () => {
			const [count, setCount] = useState(0, 'count');
			setHiddenCount = setCount;
			return node('count', count);
		});
		const Scene = defineUniversalComponent('object', () => {
			const [pending, start] = useTransition('transition');
			begin = () => start(() => setHiddenCount(1));
			return [
				node('pending', pending),
				universalActivity('hidden', () => universalComponent('object', Child, universalProps([]))),
			];
		});
		const { container, root, scheduled, flushAll } = controlledObjectRoot();

		root.render(Scene, undefined);
		begin();
		flushAll();
		expect(values(container)).toEqual({ pending: false, count: 1 });
		expect(container.children.find((child) => child.props.id === 'count')?.visible).toBe(false);
		expect(scheduled).toHaveLength(0);
		root.unmount();
	});

	it('lets a first transition attempt reveal a Suspense-hidden owner', () => {
		const first = fulfilled('first');
		const second = deferred<string>();
		const third = fulfilled('third');
		let suspend!: () => void;
		let reveal!: () => void;
		let setResource!: (value: Promise<string>) => void;
		const Child = defineUniversalComponent('object', () => {
			const [resource, updateResource] = useState<Promise<string>>(first, 'resource');
			setResource = updateResource;
			return node('content', use(resource));
		});
		const Scene = defineUniversalComponent('object', () => {
			const [pending, start] = useTransition('transition');
			suspend = () => setResource(second.promise);
			reveal = () => start(() => setResource(third));
			return [
				node('pending', pending),
				universalTry(
					() => universalComponent('object', Child, universalProps([])),
					() => node('fallback', 'loading'),
				),
			];
		});
		const { container, root, scheduled, flushAll } = controlledObjectRoot();

		root.render(Scene, undefined);
		suspend();
		flushAll();
		expect(values(container)).toEqual({ pending: false, content: 'first', fallback: 'loading' });
		expect(container.children.find((child) => child.props.id === 'content')?.visible).toBe(false);

		reveal();
		flushAll();
		expect(values(container)).toEqual({ pending: false, content: 'third' });
		expect(scheduled).toHaveLength(0);
		root.unmount();
	});

	it('rebases later urgent reducer actions over an earlier transition action', () => {
		let begin!: () => void;
		let increment!: () => void;
		const Scene = defineUniversalComponent('object', () => {
			const [count, dispatch] = useReducer(
				(value: number, delta: number) => value + delta,
				0,
				'count',
			);
			const [pending, start] = useTransition('transition');
			begin = () => start(() => dispatch(10));
			increment = () => dispatch(1);
			return [node('pending', pending), node('count', count)];
		});
		const { container, root, flushNext, flushAll } = controlledObjectRoot();

		root.render(Scene, undefined);
		begin();
		flushNext();
		flushNext();
		increment();
		flushNext();
		expect(values(container)).toEqual({ pending: true, count: 1 });

		flushAll();
		expect(values(container)).toEqual({ pending: false, count: 11 });
		root.unmount();
	});

	it('retries an ordinary urgent update after async transport rejects before acknowledgement', async () => {
		let increment!: () => void;
		const Scene = defineUniversalComponent('object', () => {
			const [count, setCount] = useState(0, 'count');
			increment = () => setCount((value) => value + 1);
			return node('count', count);
		});
		const { container, root, failNext, failureObservations, flushNext } =
			controlledTransportObjectRoot();

		await root.renderAsync(Scene, undefined);
		increment();
		failNext('pre-ack');
		flushNext();
		await expect(root.flushTransport()).rejects.toThrow(
			'transition rejected before acknowledgement',
		);
		expect(failureObservations().preAck).toEqual({ count: 0 });
		expect(values(container)).toEqual({ count: 1 });
		await root.unmountAsync();
	});

	it('retries an initial suspended replay with its memo cache after pre-ACK rejection', async () => {
		const resource = deferred<string>();
		let creations = 0;
		const Scene = defineUniversalComponent('object', () => {
			const pending = useMemo(
				() => {
					creations++;
					return resource.promise;
				},
				[],
				'resource',
			);
			return node('content', use(pending));
		});
		const { container, root, failNext, flushNext } = controlledTransportObjectRoot();

		expect((await root.renderAsync(Scene, undefined)).status).toBe('suspended');
		expect(creations).toBe(1);
		resource.resolve('ready');
		await resource.promise;
		await Promise.resolve();
		failNext('pre-ack');
		flushNext();
		await expect(root.flushTransport()).rejects.toThrow(
			'transition rejected before acknowledgement',
		);
		expect(values(container)).toEqual({ content: 'ready' });
		expect(creations).toBe(1);
		await root.unmountAsync();
	});

	it('retries transition work after an async transport rejects before acknowledgement', async () => {
		let begin!: () => void;
		const Scene = defineUniversalComponent('object', () => {
			const [count, setCount] = useState(0, 'count');
			const [pending, start] = useTransition('transition');
			begin = () => start(() => setCount(1));
			return [node('pending', pending), node('count', count)];
		});
		const { container, root, failNext, failureObservations, flushNext } =
			controlledTransportObjectRoot();

		await root.renderAsync(Scene, undefined);
		begin();
		flushNext();
		await root.flushTransport();
		expect(values(container)).toEqual({ pending: true, count: 0 });

		flushNext(); // Promote the transition.
		failNext('pre-ack');
		flushNext();
		await expect(root.flushTransport()).rejects.toThrow(
			'transition rejected before acknowledgement',
		);
		expect(failureObservations().preAck).toEqual({ pending: true, count: 0 });
		expect(values(container)).toEqual({ pending: false, count: 1 });
		await root.unmountAsync();
	});

	it('keeps an acknowledged transition committed when its transport later faults', async () => {
		let begin!: () => void;
		const Scene = defineUniversalComponent('object', () => {
			const [count, setCount] = useState(0, 'count');
			const [pending, start] = useTransition('transition');
			begin = () => start(() => setCount(1));
			return [node('pending', pending), node('count', count)];
		});
		const { container, root, failNext, failureObservations, flushNext } =
			controlledTransportObjectRoot();

		await root.renderAsync(Scene, undefined);
		begin();
		flushNext();
		await root.flushTransport();
		flushNext();
		failNext('post-ack');
		flushNext();
		await expect(root.flushTransport()).rejects.toThrow('transition fault after acknowledgement');
		expect(failureObservations().postAck).toEqual({ pending: true, count: 1 });
		expect(values(container)).toEqual({ pending: false, count: 1 });
		await root.unmountAsync();
	});

	it('settles suspended transition state when its root unmounts', async () => {
		const first = fulfilled('first');
		const second = deferred<string>();
		let begin!: () => void;
		const Scene = defineUniversalComponent('object', () => {
			const [resource, setResource] = useState<Promise<string>>(first, 'resource');
			const [pending, start] = useTransition('transition');
			begin = () => start(() => setResource(second.promise));
			return [
				node('pending', pending),
				universalTry(
					() => node('content', use(resource)),
					() => node('fallback', 'loading'),
				),
			];
		});
		const controlled = controlledObjectRoot();

		controlled.root.render(Scene, undefined);
		begin();
		controlled.flushAll();
		expect(values(controlled.container)).toEqual({ pending: true, content: 'first' });
		controlled.root.unmount();
		expect(controlled.container.children).toEqual([]);

		const Probe = defineUniversalComponent('object', () => {
			const [pending] = useTransition('transition');
			return node('pending', pending);
		});
		const probe = objectRoot();
		probe.root.render(Probe, undefined);
		expect(values(probe.container)).toEqual({ pending: false });

		second.resolve('second');
		await Promise.resolve();
		controlled.flushAll();
		expect(controlled.container.children).toEqual([]);
		probe.root.unmount();
	});

	it('settles staged transition state when its root unmounts before promotion', async () => {
		let begin!: () => void;
		const Scene = defineUniversalComponent('object', () => {
			const [count, setCount] = useState(0, 'count');
			const [pending, start] = useTransition('transition');
			begin = () => start(() => setCount(1));
			return [node('pending', pending), node('count', count)];
		});
		const controlled = controlledObjectRoot();

		controlled.root.render(Scene, undefined);
		begin();
		controlled.root.unmount();

		const Probe = defineUniversalComponent('object', () => {
			const [pending] = useTransition('transition');
			return node('pending', pending);
		});
		const probe = objectRoot();
		probe.root.render(Probe, undefined);
		expect(values(probe.container)).toEqual({ pending: false });

		controlled.flushAll();
		await drainMicrotasks();
		expect(controlled.container.children).toEqual([]);
		probe.root.unmount();
	});

	it('re-homes promotion when the first of multiple staged roots unmounts', () => {
		let updateFirst!: (value: number) => void;
		let updateSecond!: (value: number) => void;
		const First = defineUniversalComponent('object', () => {
			const [count, setCount] = useState(0, 'count');
			const [pending] = useTransition('transition');
			updateFirst = setCount;
			return [node('pending', pending), node('count', count)];
		});
		const Second = defineUniversalComponent('object', () => {
			const [count, setCount] = useState(0, 'count');
			const [pending] = useTransition('transition');
			updateSecond = setCount;
			return [node('pending', pending), node('count', count)];
		});
		const first = controlledObjectRoot();
		const second = controlledObjectRoot();
		first.root.render(First, undefined);
		second.root.render(Second, undefined);

		startTransition(() => {
			updateFirst(1);
			updateSecond(1);
		});
		first.root.unmount();
		second.flushAll();

		expect(values(second.container)).toEqual({ pending: false, count: 1 });
		second.root.unmount();
	});

	it('entangles async action updates and exposes the latest staged getter value', async () => {
		const gate = deferred<void>();
		let begin!: () => void;
		let latest!: () => number;
		const Scene = defineUniversalComponent('object', () => {
			const [count, setCount, getCount] = useState(0, 'count');
			const [pending, start] = useTransition('transition');
			latest = getCount;
			begin = () =>
				start(async () => {
					setCount((value) => value + 1);
					await gate.promise;
					setCount((value) => value + 1);
				});
			return [node('pending', pending), node('count', count)];
		});
		const { container, root } = objectRoot();

		root.render(Scene, undefined);
		begin();
		await drainMicrotasks();
		expect(values(container)).toEqual({ pending: true, count: 0 });
		expect(latest()).toBe(1);

		gate.resolve();
		await drainMicrotasks();
		expect(values(container)).toEqual({ pending: false, count: 2 });
		expect(latest()).toBe(2);
		root.unmount();
	});

	it('defers an initial preview and urgent prop changes into transition commits', async () => {
		const Scene = defineUniversalComponent('object', (props: { value: string }) =>
			node('value', useDeferredValue(props.value, 'preview', 'deferred')),
		);
		const { container, root } = objectRoot();

		root.render(Scene, { value: 'A' });
		expect(values(container)).toEqual({ value: 'preview' });
		await drainMicrotasks();
		expect(values(container)).toEqual({ value: 'A' });

		root.render(Scene, { value: 'B' });
		expect(values(container)).toEqual({ value: 'A' });
		await drainMicrotasks();
		expect(values(container)).toEqual({ value: 'B' });
		root.unmount();
	});

	it('ignores stale deferred retries when a newer value resolves first', async () => {
		const first = fulfilled('first');
		const second = deferred<string>();
		const third = fulfilled('third');
		const Scene = defineUniversalComponent('object', (props: { resource: Promise<string> }) => {
			const deferredResource = useDeferredValue(props.resource, 'deferred');
			const [pending] = useTransition('transition');
			return [
				node('pending', pending),
				universalTry(
					() => node('content', use(deferredResource)),
					() => node('fallback', 'loading'),
				),
			];
		});
		const { container, root, flushAll } = controlledObjectRoot();

		root.render(Scene, { resource: first });
		root.render(Scene, { resource: second.promise });
		expect(values(container)).toEqual({ pending: false, content: 'first' });
		flushAll();
		expect(values(container)).toEqual({ pending: true, content: 'first' });

		root.render(Scene, { resource: third });
		flushAll();
		expect(values(container)).toEqual({ pending: false, content: 'third' });
		const acceptedCommits = container.commits.length;

		second.resolve('second');
		await Promise.resolve();
		flushAll();
		expect(values(container)).toEqual({ pending: false, content: 'third' });
		expect(container.commits).toHaveLength(acceptedCommits);
		root.unmount();
	});

	it('memoizes only while props, local updates, and observed context stay unchanged', async () => {
		const Theme = createContext('light');
		const effects: string[] = [];
		let renders = 0;
		let updateParent!: () => void;
		let updateTheme!: () => void;
		let updateChild!: () => void;
		const Child = memo(
			defineUniversalComponent('object', (props: { label: string }) => {
				renders++;
				const theme = useContext(Theme);
				const [count, setCount] = useState(0, 'count');
				updateChild = () => setCount((value) => value + 1);
				useLayoutEffect(
					() => {
						effects.push(`mount:${theme}:${count}`);
						return () => effects.push(`cleanup:${theme}:${count}`);
					},
					[theme, count],
					'effect',
				);
				return node('child', `${props.label}:${theme}:${count}`);
			}),
		);
		const Parent = defineUniversalComponent('object', () => {
			const [parent, setParent] = useState(0, 'parent');
			const [theme, setTheme] = useState('light', 'theme');
			updateParent = () => setParent((value) => value + 1);
			updateTheme = () => setTheme('dark');
			return universalContext(Theme, theme, [
				node('parent', parent),
				universalComponent('object', Child, universalProps([['set', 'label', 'stable']])),
			]);
		});
		const { container, root } = objectRoot();

		root.render(Parent, undefined);
		expect(renders).toBe(1);
		expect(values(container)).toEqual({ parent: 0, child: 'stable:light:0' });

		updateParent();
		await drainMicrotasks();
		expect(renders).toBe(1);
		expect(effects).toEqual(['mount:light:0']);

		updateTheme();
		await drainMicrotasks();
		expect(renders).toBe(2);
		expect(values(container)).toEqual({ parent: 1, child: 'stable:dark:0' });

		updateChild();
		await drainMicrotasks();
		expect(renders).toBe(3);
		expect(values(container)).toEqual({ parent: 1, child: 'stable:dark:1' });
		expect(effects).toEqual([
			'mount:light:0',
			'cleanup:light:0',
			'mount:dark:0',
			'cleanup:dark:0',
			'mount:dark:1',
		]);

		root.unmount();
		expect(effects.at(-1)).toBe('cleanup:dark:1');
	});

	it('keeps nested memo comparators isolated from one another', () => {
		const Base = defineUniversalComponent('object', (props: { value: string }) =>
			node('value', props.value),
		);
		const Inner = memo(Base, () => true);
		const Outer = memo(Inner, () => false);
		const { container, root } = objectRoot();

		root.render(Outer, { value: 'A' });
		root.render(Outer, { value: 'B' });
		expect(values(container)).toEqual({ value: 'A' });
		root.unmount();
	});

	it('propagates context dependencies through nested memo wrappers', () => {
		const Theme = createContext('light');
		let renders = 0;
		const Base = defineUniversalComponent('object', () => {
			renders++;
			return node('theme', useContext(Theme));
		});
		const Child = memo(memo(Base), () => true);
		const Parent = defineUniversalComponent('object', (props: { theme: string }) =>
			universalContext(Theme, props.theme, universalComponent('object', Child, universalProps([]))),
		);
		const { container, root } = objectRoot();

		root.render(Parent, { theme: 'light' });
		root.render(Parent, { theme: 'dark' });
		expect(values(container)).toEqual({ theme: 'dark' });
		expect(renders).toBe(2);
		root.unmount();
	});

	it('does not publish pending UI after a transition callback throws synchronously', () => {
		const Scene = defineUniversalComponent('object', () => {
			const [pending] = useTransition('transition');
			return node('pending', pending);
		});
		const { container, root, flushAll } = controlledObjectRoot();

		root.render(Scene, undefined);
		expect(() =>
			startTransition(() => {
				throw new Error('transition fault');
			}),
		).toThrow('transition fault');
		flushAll();
		expect(values(container)).toEqual({ pending: false });
		root.unmount();
	});

	it('settles promoted transition work when a coalesced urgent render throws', () => {
		let begin!: () => void;
		let fail!: () => void;
		const Scene = defineUniversalComponent('object', () => {
			const [count, setCount] = useState(0, 'count');
			const [bad, setBad] = useState(false, 'bad');
			const [pending, start] = useTransition('transition');
			begin = () => start(() => setCount(1));
			fail = () => setBad(true);
			if (bad) throw new Error('urgent render failed');
			return [node('pending', pending), node('count', count)];
		});
		const controlled = controlledObjectRoot();

		controlled.root.render(Scene, undefined);
		begin();
		controlled.flushNext(); // Publish pending urgently.
		controlled.flushNext(); // Promote transition work.
		fail();
		expect(() => controlled.flushNext()).toThrow('urgent render failed');

		const Probe = defineUniversalComponent('object', () => {
			const [pending] = useTransition('transition');
			return node('pending', pending);
		});
		const probe = objectRoot();
		probe.root.render(Probe, undefined);
		expect(values(probe.container)).toEqual({ pending: false });
		controlled.root.unmount();
		probe.root.unmount();
	});

	it('reads an async transition thenable once and unwinds a throwing then method', async () => {
		let reads = 0;
		const accessorThenable = {
			get then() {
				reads++;
				return reads === 1 ? (resolve: () => void) => resolve() : undefined;
			},
		};
		startTransition(() => accessorThenable as any);
		await drainMicrotasks();
		expect(reads).toBe(1);

		expect(() =>
			startTransition(
				() =>
					({
						then() {
							throw new Error('then invocation failed');
						},
					}) as any,
			),
		).toThrow('then invocation failed');
		await drainMicrotasks();

		const Probe = defineUniversalComponent('object', () => {
			const [pending] = useTransition('transition');
			return node('pending', pending);
		});
		const probe = objectRoot();
		probe.root.render(Probe, undefined);
		expect(values(probe.container)).toEqual({ pending: false });
		probe.root.unmount();
	});

	it('settles a transition with no state work without leaving subscribers pending', async () => {
		let begin!: () => void;
		const Scene = defineUniversalComponent('object', () => {
			const [pending] = useTransition('transition');
			begin = () => startTransition(() => {});
			return node('pending', pending);
		});
		const { container, root } = objectRoot();

		root.render(Scene, undefined);
		begin();
		await drainMicrotasks();
		expect(values(container)).toEqual({ pending: false });
		root.unmount();
	});
});
