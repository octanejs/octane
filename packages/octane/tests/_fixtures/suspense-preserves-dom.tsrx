import {
	createPortal,
	memo,
	use,
	useEffect,
	useInsertionEffect,
	useLayoutEffect,
	useState,
	useSyncExternalStore,
	useTransition,
} from 'octane';

function PreservedPanel() @{
	const [count, setCount] = useState(0);
	<aside id="preserved-panel" style="display: grid !important; gap: 4px">
		<button id="preserved-count" onClick={() => setCount(count + 1)}>{'count:' + count}</button>
		<input id="preserved-input" defaultValue="initial value" />
		<div id="preserved-scroller" style={{ overflow: 'auto', height: '40px', width: '160px' }}>
			<div style={{ height: '1000px' }}>{'tall content'}</div>
		</div>
		<div id="preserved-editable" contentEditable={true}>{'editable selection text'}</div>
	</aside>
}

function PortalReader(props) @{
	props.renderLog?.push('portal:render');
	const value = useSyncExternalStore(props.store.subscribe, props.store.get);
	useLayoutEffect((log) => {
		log.push('portal:layout');
		return () => log.push('portal:cleanup');
	}, [props.log]);
	<button id="preserved-portal" ref={props.portalRef}>{'portal:' + value}</button>
}

// A component-returned portal exercises childSlot's embedded PortalSlot path.
function ValuePortal(props) {
	return createPortal(
		<PortalReader
			store={props.store}
			log={props.log}
			renderLog={props.renderLog}
			portalRef={props.portalRef}
		/>,
		props.target,
	);
}

function MemoizedOrderedEffect(props) @{
	props.renderLog.push('memo:render');
	useLayoutEffect((log) => {
		log.push('memo:layout');
		return () => log.push('memo:cleanup');
	}, [props.orderLog]);
	<span id="memo-ordered-effect">{'memo'}</span>
}

const StableOrderedEffect = memo(MemoizedOrderedEffect);

function EffectHistoryOrder(props) @{
	useLayoutEffect((log, value) => {
		log.push('first:' + value);
		return () => log.push('cleanup:first:' + value);
	}, [props.orderLog, props.first]);
	useLayoutEffect((log, value) => {
		log.push('second:' + value);
		return () => log.push('cleanup:second:' + value);
	}, [props.orderLog, props.second]);
	<span id="effect-history-order">{'effects'}</span>
}

const StableEffectHistoryOrder = memo(EffectHistoryOrder);

export function SuspenseEffectHistoryOrderApp(props) @{
	@try {
		<>
			<StableEffectHistoryOrder
				orderLog={props.orderLog}
				first={props.first}
				second={props.second}
			/>
			<AsyncRoute promise={props.promise} />
		</>
	} @pending {
		<span id="effect-history-fallback">{'loading'}</span>
	}
}

function SuspensePassiveSurvivor(props) @{
	useEffect((log) => {
		log.push('passive:mount');
		return () => log.push('passive:cleanup');
	}, [props.log]);
	<span id="passive-survivor">{'passive'}</span>
}

export function SuspensePassiveSurvivalApp(props) @{
	@try {
		<>
			<SuspensePassiveSurvivor log={props.log} />
			<AsyncRoute promise={props.promise} />
		</>
	} @pending {
		<span id="passive-survival-fallback">{'loading'}</span>
	}
}

function UpdatingOrderedEffect(props) @{
	props.renderLog.push('updating:render:' + props.route);
	useLayoutEffect((log, route) => {
		log.push('updating:layout:' + route);
		return () => log.push('updating:cleanup:' + route);
	}, [props.orderLog, props.route]);
	<span id="updating-ordered-effect">{'updating:' + props.route}</span>
}

export function SuspenseEffectOrderApp(props) @{
	const [route, setRoute] = useState('A');
	props.bind({
		suspend() {
			setRoute('B');
		},
	});
	@try {
		<>
			<StableOrderedEffect orderLog={props.orderLog} renderLog={props.renderLog} />
			<UpdatingOrderedEffect orderLog={props.orderLog} renderLog={props.renderLog} route={route} />
			<AsyncRoute promise={props.promiseFor(route)} />
		</>
	} @pending {
		<span id="ordered-effects-fallback">{'loading'}</span>
	}
}

function AsyncRoute(props) @{
	const value = use(props.promise);
	<main id="preserved-route">{'route:' + value}</main>
}

function RouteA() @{
	<main id="preserved-route">{'route:A'}</main>
}

function Primary(props) @{
	<>
		<PreservedPanel />
		<ValuePortal
			target={props.portalTarget}
			store={props.store}
			log={props.log}
			renderLog={props.renderLog}
			portalRef={props.portalRef}
		/>
		@if (props.shape === 'swap') {
			@if (props.route === 'A') {
				<RouteA />
			} @else {
				<AsyncRoute promise={props.promiseFor(props.route)} />
			}
		} @else {
			<AsyncRoute promise={props.promiseFor(props.route)} />
		}
		{props.directText as string}
	</>
}

export function SuspensePreservationApp(props) @{
	const [route, setRoute] = useState('A');
	const [isPending, start] = useTransition();
	props.bind({
		urgent(next) {
			setRoute(next);
		},
		transition(next) {
			start(() => setRoute(next));
		},
	});
	<section id="preservation-app">
		<output id="preserved-transition">
			{isPending ? 'pending' : 'idle'}
		</output>
		@try {
			<Primary
				shape={props.shape}
				route={route}
				promiseFor={props.promiseFor}
				portalTarget={props.portalTarget}
				store={props.store}
				log={props.log}
				renderLog={props.renderLog}
				portalRef={props.portalRef}
				directText={props.directText}
			/>
		} @pending {
			<p id="preserved-fallback">{'loading'}</p>
		}
	</section>
}

function NestedPrimary(props) @{
	<>
		@try {
			<>
				<ValuePortal
					target={props.portalTarget}
					store={props.store}
					log={props.log}
					renderLog={props.renderLog}
					portalRef={props.portalRef}
				/>
				<AsyncRoute promise={props.innerPromise} />
			</>
		} @pending {
			<span id="inner-fallback">{'inner loading'}</span>
		}
		<AsyncRoute promise={props.outerPromise} />
	</>
}

export function NestedPortalPreservation(props) @{
	@try {
		<NestedPrimary
			innerPromise={props.innerPromise}
			outerPromise={props.outerPromise}
			portalTarget={props.portalTarget}
			store={props.store}
			log={props.log}
			renderLog={props.renderLog}
			portalRef={props.portalRef}
		/>
	} @pending {
		<span id="outer-fallback">{'outer loading'}</span>
	}
}

function DirectRootRefAsyncValue(props) @{
	const value = use(props.promise);
	<span id="direct-ref-value">{'value:' + value}</span>
}

export function DirectRootRefUnmountApp(props) @{
	@try {
		<>
			<input id="direct-ref-input" defaultValue="primary" ref={props.inputRef} />
			<DirectRootRefAsyncValue promise={props.promise} />
		</>
	} @pending {
		<p id="direct-ref-fallback">{'loading'}</p>
	}
}

export function HiddenPrimaryRefCatchApp(props) @{
	@try {
		const value = use(props.promise);
		<span id="hidden-ref-primary" ref={props.primaryRef}>{value as string}</span>
	} @pending {
		<span id="hidden-ref-fallback">{'loading'}</span>
	} @catch (error) {
		<span id="hidden-ref-catch">{error.message as string}</span>
	}
}

export function HiddenInsertionCleanupApp(props) @{
	@try {
		const value = use(props.promise);
		useInsertionEffect(() => props.onInsertionCleanup, [props.onInsertionCleanup]);
		<span id="hidden-insertion-primary">{value as string}</span>
	} @pending {
		<span id="hidden-insertion-fallback">{'loading'}</span>
	}
}

export function IndependentRefApp(props) @{
	<span id="independent-ref" ref={props.hostRef}>{'independent'}</span>
}

function NestedAbortedRefChild(props) @{
	<span id="nested-aborted-ref" ref={props.hostRef}>{'uncommitted'}</span>
}

function NestedAbortedThrow() {
	throw new Error('abort');
}

export function NestedAbortedRefApp(props) @{
	@try {
		<>
			<NestedAbortedRefChild hostRef={props.hostRef} />
			<NestedAbortedThrow />
		</>
	} @catch (error) {
		<span id="nested-aborted-catch">{error.message as string}</span>
	}
}

function ReentrantPendingArm(props) @{
	useLayoutEffect(() => props.onCleanup, [props.onCleanup]);
	<span id="reentrant-resume-fallback">{'loading'}</span>
}

export function ReentrantResumeCleanupApp(props) @{
	@try {
		<AsyncRoute promise={props.promise} />
	} @pending {
		<ReentrantPendingArm onCleanup={props.onCleanup} />
	}
}

function ReentrantThrowingPrimary(props) @{
	useLayoutEffect(() => props.onCleanup, [props.onCleanup]);
	if (props.fail) throw new Error('boom');
	<span id="reentrant-catch-primary">{'ready'}</span>
}

export function ReentrantCatchCleanupApp(props) @{
	@try {
		<ReentrantThrowingPrimary fail={props.fail} onCleanup={props.onCleanup} />
	} @catch (error) {
		<span id="reentrant-catch-arm">{error.message as string}</span>
	}
}

function ReadyComponentSlotArm() @{
	<span id="component-slot-old">{'ready'}</span>
}

function PendingComponentSlotArm(props) @{
	const value = use(props.promise);
	<span id="component-slot-new">{value as string}</span>
}

export function UrgentComponentSlotSuspenseApp(props) @{
	const Current = props.pending ? PendingComponentSlotArm : ReadyComponentSlotArm;
	@try {
		<Current promise={props.promise} />
	} @pending {
		<span id="component-slot-fallback">{'loading'}</span>
	}
}

function ReadyChildSlotArm() @{
	<span id="child-slot-old">{'ready'}</span>
}

function PendingChildSlotArm(props) @{
	const value = use(props.promise);
	<span id="child-slot-new">{value as string}</span>
}

export function UrgentChildSlotSuspenseApp(props) @{
	const child = props.pending
		? <PendingChildSlotArm promise={props.promise} />
		: <ReadyChildSlotArm />;
	@try {
		<>
			{child}
		</>
	} @pending {
		<span id="child-slot-fallback">{'loading'}</span>
	}
}

function PendingReturnKindArm(props) @{
	const value = use(props.promise);
	<span id="return-kind-new">{value as string}</span>
}

function ReturnKindBody(props) {
	if (props.pending) return <PendingReturnKindArm promise={props.promise} />;
	return <span id="return-kind-old">ready</span>;
}

export function UrgentReturnKindSuspenseApp(props) @{
	@try {
		<ReturnKindBody pending={props.pending} promise={props.promise} />
	} @pending {
		<span id="return-kind-fallback">{'loading'}</span>
	}
}

function ReentrantOldBranch(props) @{
	useLayoutEffect(() => props.onCleanup, [props.onCleanup]);
	<span id="reentrant-wip-old">{'old'}</span>
}

function ReentrantIncomingBranch(props) @{
	useLayoutEffect((log) => {
		log.push('layout:new');
	}, [props.log]);
	<span id="reentrant-wip-new" ref={props.incomingRef}>{'new'}</span>
}

export function UrgentWipReentrantUnmountApp(props) @{
	@try {
		@if (props.next) {
			<ReentrantIncomingBranch log={props.log} incomingRef={props.incomingRef} />
		} @else {
			<ReentrantOldBranch onCleanup={props.onCleanup} />
		}
	} @pending {
		<span id="reentrant-wip-fallback">{'loading'}</span>
	}
}

export function TransitionComponentWipReentrantUnmountApp(props) @{
	const [next, setNext] = useState(false);
	const [, start] = useTransition();
	props.bind({
		go() {
			start(() => setNext(true));
		},
	});
	const Current = next ? ReentrantIncomingBranch : ReentrantOldBranch;
	@try {
		<Current onCleanup={props.onCleanup} log={props.log} incomingRef={props.incomingRef} />
	} @pending {
		<span id="reentrant-component-wip-fallback">{'loading'}</span>
	}
}

export function TransitionChildWipReentrantUnmountApp(props) @{
	const [next, setNext] = useState(false);
	const [, start] = useTransition();
	props.bind({
		go() {
			start(() => setNext(true));
		},
	});
	const child = next
		? <ReentrantIncomingBranch log={props.log} incomingRef={props.incomingRef} />
		: <ReentrantOldBranch onCleanup={props.onCleanup} />;
	@try {
		<>
			{child}
		</>
	} @pending {
		<span id="reentrant-child-wip-fallback">{'loading'}</span>
	}
}
