import {
	Children,
	cloneElement,
	flushSync,
	isChildrenBlock,
	useContext,
	useLayoutEffect,
	useRef,
	useState,
	type OctaneNode,
} from 'octane';
import config from './config.ts';
import TransitionGroupContext from './TransitionGroupContext.ts';
import type {
	TransitionComponent,
	TransitionProps,
	TransitionStatus,
	TransitionTimeout,
} from './types.ts';
import { forceReflow } from './utils/reflow.ts';

export const UNMOUNTED = 'unmounted';
export const EXITED = 'exited';
export const ENTERING = 'entering';
export const ENTERED = 'entered';
export const EXITING = 'exiting';

function getTimeouts(timeout: TransitionTimeout | undefined) {
	if (typeof timeout === 'number' || timeout === undefined) {
		return { appear: timeout, enter: timeout, exit: timeout };
	}
	return {
		appear: timeout.appear === undefined ? timeout.enter : timeout.appear,
		enter: timeout.enter,
		exit: timeout.exit,
	};
}

function callEnterCallback(
	callback: TransitionProps['onEnter'],
	nodeRef: TransitionProps['nodeRef'],
	node: Element | undefined,
	appearing: boolean,
) {
	if (nodeRef) (callback as ((isAppearing: boolean) => void) | undefined)?.(appearing);
	else callback?.(node, appearing);
}

function TransitionImpl(props: TransitionProps) @{
	const group = useContext(TransitionGroupContext);
	const latestProps = useRef(props);
	latestProps.current = props;
	const initial = useRef<
		{ status: TransitionStatus; appearStatus: TransitionStatus | null } | null
	>(null);
	if (initial.current === null) {
		const appearing =
			group && !group.isMounting ? props.enter !== false : props.appear === true;
		if (props.in) {
			initial.current = appearing
				? { status: EXITED, appearStatus: ENTERING }
				: { status: ENTERED, appearStatus: null };
		} else {
			initial.current = {
				status: props.unmountOnExit || props.mountOnEnter ? UNMOUNTED : EXITED,
				appearStatus: null,
			};
		}
	}

	const [status, setStatus] = useState<TransitionStatus>(initial.current.status);
	const mounted = useRef(false);
	const generation = useRef(0);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const previousIn = useRef(props.in === true);
	// Upstream calls onEntering/onExiting/onEntered/onExited from setState
	// callbacks so the committed status is observable. Schedule those after the
	// matching status commit instead of firing them synchronously with setState.
	const pendingPhase = useRef<{ status: TransitionStatus; run: () => void } | null>(null);

	const cancelPending = () => {
		generation.current += 1;
		pendingPhase.current = null;
		if (timer.current !== null) {
			clearTimeout(timer.current);
			timer.current = null;
		}
	};

	const finishAfter = (timeout: number | undefined, done: () => void) => {
		const run = generation.current;
		let active = true;
		const finish = () => {
			if (!active || run !== generation.current || !mounted.current) return;
			active = false;
			timer.current = null;
			done();
		};
		const live = latestProps.current;
		const node = live.nodeRef?.current ?? undefined;
		if (live.nodeRef && !node) {
			timer.current = setTimeout(finish, 0);
			return;
		}
		if (live.addEndListener) {
			if (live.nodeRef) (live.addEndListener as (done: () => void) => void)(finish);
			else if (node) (live.addEndListener as (node: Element, done: () => void) => void)(
				node,
				finish,
			);
		}
		if (active && timeout !== undefined) timer.current = setTimeout(finish, timeout);
		else if (active && (!live.addEndListener || !node)) timer.current = setTimeout(finish, 0);
	};

	const commitStatus = (next: TransitionStatus, run: () => void) => {
		pendingPhase.current = { status: next, run };
		setStatus(next);
	};

	// Final ENTERED/EXITED completions must run before the current timeout
	// callback yields — otherwise fake-timer suites can fire a slower
	// addEndListener in the same runAllTimers pass before onEntered.
	const commitStatusNow = (next: TransitionStatus, run: () => void) => {
		pendingPhase.current = { status: next, run };
		flushSync(function applyStatus() {
			setStatus(next);
		});
		if (pendingPhase.current && pendingPhase.current.status === next) {
			const pending = pendingPhase.current;
			pendingPhase.current = null;
			pending.run();
		}
	};

	const performEnter = (mounting: boolean) => {
		cancelPending();
		const appearing = group ? group.isMounting : mounting;
		const node = props.nodeRef?.current ?? undefined;
		if (!mounting && props.enter === false || config.disabled) {
			commitStatus(ENTERED, function afterEntered() {
				const live = latestProps.current;
				callEnterCallback(live.onEntered, live.nodeRef, node, appearing);
			});
			return;
		}
		callEnterCallback(props.onEnter, props.nodeRef, node, appearing);
		const timeouts = getTimeouts(props.timeout);
		commitStatus(ENTERING, function afterEntering() {
			const live = latestProps.current;
			callEnterCallback(live.onEntering, live.nodeRef, node, appearing);
			finishAfter(appearing ? timeouts.appear : timeouts.enter, function enterDone() {
				commitStatusNow(ENTERED, function afterEntered() {
					const live = latestProps.current;
					callEnterCallback(live.onEntered, live.nodeRef, node, appearing);
				});
			});
		});
	};

	const performExit = () => {
		cancelPending();
		const node = props.nodeRef?.current ?? undefined;
		if (props.exit === false || config.disabled) {
			commitStatus(EXITED, function afterExited() {
				const live = latestProps.current;
				live.onExited?.(live.nodeRef ? undefined : node);
			});
			return;
		}
		props.onExit?.(props.nodeRef ? undefined : node);
		commitStatus(EXITING, function afterExiting() {
			const live = latestProps.current;
			live.onExiting?.(live.nodeRef ? undefined : node);
			finishAfter(getTimeouts(live.timeout).exit, function exitDone() {
				commitStatusNow(EXITED, function afterExited() {
					const live = latestProps.current;
					live.onExited?.(live.nodeRef ? undefined : node);
				});
			});
		});
	};

	useLayoutEffect(() => {
		mounted.current = true;
		if (initial.current!.appearStatus === ENTERING) {
			initial.current!.appearStatus = null;
			performEnter(true);
		}
		return () => {
			mounted.current = false;
			cancelPending();
		};
	}, []);

	useLayoutEffect(() => {
		const nextIn = props.in === true;
		if (nextIn !== previousIn.current) {
			if (nextIn) {
				if (status === UNMOUNTED) {
					setStatus(EXITED);
					return;
				}
				previousIn.current = true;
				if (props.unmountOnExit || props.mountOnEnter) {
					const node = props.nodeRef?.current;
					if (node) forceReflow(node);
				}
				performEnter(false);
			} else if (status === ENTERING || status === ENTERED) {
				previousIn.current = false;
				performExit();
			} else {
				previousIn.current = false;
			}
		} else if (!nextIn && props.unmountOnExit && status === EXITED) {
			setStatus(UNMOUNTED);
		}
	}, null);

	useLayoutEffect(() => {
		const pending = pendingPhase.current;
		if (pending && pending.status === status) {
			pendingPhase.current = null;
			pending.run();
		}
	}, [status]);

	let rendered: OctaneNode = null;
	if (status !== UNMOUNTED) {
		const {
			children,
			in: _in,
			mountOnEnter: _mountOnEnter,
			unmountOnExit: _unmountOnExit,
			appear: _appear,
			enter: _enter,
			exit: _exit,
			timeout: _timeout,
			addEndListener: _addEndListener,
			onEnter: _onEnter,
			onEntering: _onEntering,
			onEntered: _onEntered,
			onExit: _onExit,
			onExiting: _onExiting,
			onExited: _onExited,
			nodeRef: _nodeRef,
			...childProps
		} = props;
		rendered = typeof children === 'function' && !isChildrenBlock(children)
			? children(status, childProps)
			: isChildrenBlock(children)
				? children
				: cloneElement(Children.only(children), childProps);
	}

	<TransitionGroupContext.Provider value={null}>{rendered}</TransitionGroupContext.Provider>
}

export const Transition = TransitionImpl as unknown as TransitionComponent;
Transition.UNMOUNTED = UNMOUNTED;
Transition.EXITED = EXITED;
Transition.ENTERING = ENTERING;
Transition.ENTERED = ENTERED;
Transition.EXITING = EXITING;

export default Transition;
