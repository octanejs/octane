import {
	createContext,
	flushSync,
	memo,
	use,
	useContext,
	useEffect,
	useLayoutEffect,
	useReducer,
	useState,
} from 'octane';

let _setFirst: any = null;
let _setSecond: any = null;
let _setParent: any = null;
let _setChild: any = null;
let _setCrossRootA: any = null;
let _setCrossRootB: any = null;
let _setDeleteParent: any = null;
let _setDeleteChild: any = null;
let _setMemoChild: any = null;
let _setNestedEffectStep: any = null;
let _setFiniteLayoutStep: any = null;
let _setFunctionSwitchMode: any = null;
let _bumpFunctionSwitch: any = null;
let _setFunctionSwitchContext: any = null;
let _bumpExternalUnmountTarget: any = null;

export function setFirst(value: any) {
	_setFirst(value);
}
export function setSecond(value: any) {
	_setSecond(value);
}
export function setParent(value: any) {
	_setParent(value);
}
export function setChild(value: any) {
	_setChild(value);
}
export function setCrossRootA(value: any) {
	_setCrossRootA(value);
}
export function setCrossRootB(value: any) {
	_setCrossRootB(value);
}
export function setDeleteParent(value: any) {
	_setDeleteParent(value);
}
export function setDeleteChild(value: any) {
	_setDeleteChild(value);
}
export function setMemoChild(value: any) {
	_setMemoChild(value);
}
export function setNestedEffectStep(value: any) {
	_setNestedEffectStep(value);
}
export function setFiniteLayoutStep(value: any) {
	_setFiniteLayoutStep(value);
}
export function showTaggedFunctionChildren() {
	_setFunctionSwitchMode(true);
}
export function bumpFunctionSwitch() {
	_bumpFunctionSwitch((value: number) => value + 1);
}
export function setFunctionSwitchContext(value: string) {
	_setFunctionSwitchContext(value);
}
export function bumpExternalUnmountTarget() {
	_bumpExternalUnmountTarget((value: number) => value + 1);
}

export function BatchedPair(props) @{
	const [first, setFirst] = useState(0);
	const [second, setSecond] = useState(0);
	_setFirst = setFirst;
	_setSecond = setSecond;
	useLayoutEffect(() => {
		props.log(`${props.label}:${first},${second}`);
	}, [props.label, first, second]);
	<div id="pair" data-label={props.label as string}>
		<span id="first">
			{first as number}
		</span>
		<span id="second">
			{second as number}
		</span>
	</div>
}

function BatchedChild(props) @{
	const [child, setChild] = useState(0);
	_setChild = setChild;
	useLayoutEffect(() => {
		props.log(`child:${props.parent},${child}`);
	}, [props.parent, child]);
	<span id="child-value">{`${props.parent},${child}`}</span>
}

export function BatchedParentChild(props) @{
	const [parent, setParent] = useState(0);
	_setParent = setParent;
	useLayoutEffect(() => {
		props.log(`parent:${parent}`);
	}, [parent]);
	<div id="parent-value">
		{parent as number}
		<BatchedChild parent={parent} log={props.log} />
	</div>
}

function MemoChild(props) @{
	const [value, setValue] = useState(0);
	_setMemoChild = setValue;
	useLayoutEffect(() => {
		props.log(`child:${value}`);
	}, [value]);
	<span id="memo-child">
		{value as number}
	</span>
}

function MemoParentBody(props) @{
	useLayoutEffect(() => {
		props.log(`parent:${props.label}`);
	}, null);
	<div id="memo-parent">
		<MemoChild log={props.log} />
	</div>
}

const MemoParent = memo(MemoParentBody);

export function MemoParentHost(props) @{
	const [tick, setTick] = useState(0);
	<div data-tick={tick as number}>
		<button id="memo-parent-update" onClick={() => setTick(tick + 1)}>{'parent'}</button>
		<MemoParent label="stable" log={props.log} />
	</div>
}

function StableBottom(props) @{
	useLayoutEffect(() => {
		props.log('bottom');
	}, null);
	<span id="stable-bottom">{'stable'}</span>
}

function StableMiddle(props) {
	const [step, setStep] = useState(0);
	useLayoutEffect(() => {
		props.log(`middle:${step}`);
		if (step === 0) setStep(1);
	}, [step]);
	return props.children;
}

export function StableChildrenHost(props) @{
	<StableMiddle log={props.log}>
		<StableBottom log={props.log} />
	</StableMiddle>
}

function StableRetryLeaf(props) {
	const value = use(props.promise);
	return <span id="stable-retry-value">
		{value as string}
	</span>;
}

function StableRetryShell(props) @{
	<>
		@try {
			<>
				{props.children}
			</>
		} @pending {
			<span id="stable-retry-pending">{'loading'}</span>
		}
	</>
}

export function StableChildrenSuspenseRetry(props) @{
	<StableRetryShell>
		<StableRetryLeaf promise={props.promise} />
	</StableRetryShell>
}

const FunctionSwitchContext = createContext('initial');

function FunctionSwitchConsumer(props) @{
	const value = useContext(FunctionSwitchContext);
	useLayoutEffect(() => {
		props.log(`switch-consumer:${value}`);
	}, null);
	<span id="function-switch-consumer">{value}</span>
}

function FunctionSwitchPassthrough(props) {
	const [, setTick] = useState(0);
	_bumpFunctionSwitch = setTick;
	return props.tagged ? props.taggedChild : props.initialChild;
}

function FunctionSwitchShell(props) @{
	const [tagged, setTagged] = useState(false);
	const [value, setValue] = useState('initial');
	_setFunctionSwitchMode = setTagged;
	_setFunctionSwitchContext = setValue;
	<FunctionSwitchContext.Provider value={value}>
		<FunctionSwitchPassthrough
			tagged={tagged}
			taggedChild={props.children}
			initialChild={props.initialChild}
		/>
	</FunctionSwitchContext.Provider>
}

export function FunctionToTaggedChildrenHost(props) @{
	<FunctionSwitchShell initialChild={() => <span id="function-switch-initial">{'initial'}</span>}>
		<FunctionSwitchConsumer log={props.log} />
	</FunctionSwitchShell>
}

export function CrossRootA(props) @{
	const [value, setValue] = useState(0);
	_setCrossRootA = setValue;
	useLayoutEffect(() => {
		if (value === 1) props.log(`a-sees:${props.other.textContent}`);
	}, [value]);
	<span id="cross-a">{`A${value}`}</span>
}

export function CrossRootB() @{
	const [value, setValue] = useState(0);
	_setCrossRootB = setValue;
	<span id="cross-b">{`B${value}`}</span>
}

function DeleteChild(props) @{
	const [value, setValue] = useState(0);
	_setDeleteChild = setValue;
	useLayoutEffect(() => {
		props.log(`child:${value}`);
	}, [value]);
	<span id="delete-child">
		{value as number}
	</span>
}

export function DeletePendingChild(props) @{
	const [show, setShow] = useState(true);
	_setDeleteParent = setShow;
	<div>
		{show ? <DeleteChild log={props.log} /> : <span id="deleted">{'deleted'}</span>}
	</div>
}

export function ReentrantEditor(props) @{
	useLayoutEffect(() => {
		if (!props.rendered) props.onChange();
	}, [props.rendered]);
	<div id="editor">
		{props.text as string}
	</div>
}

const _renderPhaseBases: string[] = [];

export function resetRenderPhaseBases() {
	_renderPhaseBases.length = 0;
}
export function getRenderPhaseBases() {
	return _renderPhaseBases.slice();
}

export function RenderPhaseBaseState() @{
	const [step, setStep] = useState(0);
	const memoizedStep = step;
	setStep((baseStep: number) => {
		_renderPhaseBases.push(`base:${baseStep},memoized:${memoizedStep}`);
		return baseStep === 0 ? 1 : baseStep;
	});
	<span id="render-phase-base">
		{step as number}
	</span>
}

export function HiddenSubtree(props) @{
	<div id="hidden-owner" hidden>
		<span id="hidden-value">
			{props.value as string}
		</span>
	</div>
}

export function IndependentCell(props) @{
	const [value, setValue] = useState(0);
	useEffect(() => {
		if (props.trigger) setValue(1);
	}, [props.trigger]);
	<span class="independent-cell">
		{value as number}
	</span>
}

export function ManyRootsSpawner(props) @{
	useLayoutEffect(() => {
		props.spawn();
	}, []);
	<span id="root-spawner">{'spawned'}</span>
}

function BatchCell(props) @{
	const [value, setValue] = useState(0);
	props.capture(props.id, setValue);
	<span class="batch-cell" data-id={props.id as number}>
		{value as number}
	</span>
}

export function ManyBatchCells(props) @{
	<div id="many-batch-cells">
		@for (const id of props.ids; key id) {
			<BatchCell id={id} capture={props.capture} />
		}
	</div>
}

export function LayoutEffectLoop() @{
	const [step, setStep] = useState(0);
	useLayoutEffect(() => {
		setStep((value: number) => value + 1);
	}, null);
	<span>
		{step as number}
	</span>
}

export function LayoutCleanupLoop() @{
	const [step, setStep] = useState(0);
	useLayoutEffect(() => {
		return () => setStep((value: number) => value + 1);
	}, [step]);
	useLayoutEffect(() => {
		setStep(1);
	}, []);
	<span>
		{step as number}
	</span>
}

export function PassiveCleanupLoop() @{
	const [step, setStep] = useState(0);
	useEffect(() => {
		return () => setStep((value: number) => value + 1);
	}, [step]);
	useEffect(() => {
		setStep(1);
	}, []);
	<span>
		{step as number}
	</span>
}

export function MixedLayoutRenderLoop() @{
	const [step, setStep] = useState(0);
	const [derived, setDerived] = useState(-1);
	if (derived !== step) setDerived(step);
	useLayoutEffect(() => {
		setStep((value: number) => value + 1);
	}, [derived]);
	<span>{`${step}:${derived}`}</span>
}

function CoalescedLoopChild(props) @{
	const [step, setStep] = useState(0);
	useLayoutEffect(() => {
		if (step < 50) {
			setStep(step + 1);
		} else if (step === 50) {
			props.bumpParent();
			setStep(51);
		}
	}, null);
	<span>{`${props.parent}:${step}`}</span>
}

export function CoalescedParentChildLoop() @{
	const [parent, setParent] = useState(0);
	<CoalescedLoopChild parent={parent} bumpParent={() => setParent((value: number) => value + 1)} />
}

function CrossComponentLoopChild(props) {
	props.update((value: number) => value + 1);
	return null;
}

export function CrossComponentRenderLoop() @{
	const [, setValue] = useState(0);
	<CrossComponentLoopChild update={setValue} />
}

function CrossComponentAsyncLoopChild(props) {
	props.update((value: number) => value + 1);
	return null;
}

export function CrossComponentAsyncRenderLoop() @{
	const [, setValue] = useState(0);
	<CrossComponentAsyncLoopChild update={setValue} />
}

export function NestedEffectUpdates(props) @{
	const [step, setStep] = useState(0);
	_setNestedEffectStep = setStep;
	useEffect(() => {
		if (step < props.limit) setStep((value: number) => value + 1);
	}, null);
	<span id="nested-effect-step">
		{step as number}
	</span>
}

export function ExternalUnmountCleanupSource(props) @{
	useLayoutEffect(() => {
		return () => props.bumpTarget();
	}, []);
	<span id="external-unmount-source">{'source'}</span>
}

export function ExternalUnmountTarget() @{
	const [step, setStep] = useState(0);
	_bumpExternalUnmountTarget = setStep;
	useEffect(() => {
		if (step < 50) setStep((value: number) => value + 1);
	}, null);
	<span id="external-unmount-target">
		{step as number}
	</span>
}

export function ManyUpdatesInOneEffect() @{
	const [step, setStep] = useState(0);
	useEffect(() => {
		for (let i = 0; i < 1000; i++) setStep((value: number) => value + 1);
	}, []);
	<span id="many-effect-updates">
		{step as number}
	</span>
}

export function SynchronousPassiveEffectLoop() @{
	const [step, setStep] = useState(0);
	useEffect(() => {
		flushSync(() => setStep(step + 1));
	}, [step]);
	<span>
		{step as number}
	</span>
}

export function RefCallbackLoop() @{
	const [count, dispatch] = useReducer((value: number) => value + 1, 0);
	<div
		ref={() => {
			for (let i = 0; i < 50; i++) dispatch(1);
		}}
	>
		{count as number}
	</div>
}

export function FiniteLayoutChain(props) @{
	const [step, setStep] = useState(0);
	_setFiniteLayoutStep = setStep;
	useLayoutEffect(() => {
		if (step < props.limit) setStep((value: number) => value + 1);
	}, null);
	<span id="finite-layout-step">
		{step as number}
	</span>
}

export function OneStepLayoutUpdate() @{
	const [step, setStep] = useState(0);
	useLayoutEffect(() => {
		if (step === 0) setStep(1);
	}, null);
	<span id="one-step-layout">
		{step as number}
	</span>
}

function AlwaysThrows() @{
	throw new Error('error loop');
	<span>{'unreachable'}</span>
}

function RemountAfterError(props) @{
	useLayoutEffect(() => {
		props.remount();
	}, []);
	<span data-error={props.message as string}>{'recovering'}</span>
}

export function ErrorRecoveryLoop() @{
	const [attempt, setAttempt] = useState(0);
	<div data-attempt={attempt as number}>
		@try {
			<AlwaysThrows key={attempt} />
		} @catch (err) {
			<RemountAfterError
				key={attempt}
				message={err.message}
				remount={() => setAttempt((value: number) => value + 1)}
			/>
		}
	</div>
}

export function RootLoopA(props) @{
	useLayoutEffect(() => {
		props.swap('b');
	}, []);
	<span>{'a'}</span>
}

export function RootLoopB(props) @{
	useLayoutEffect(() => {
		props.swap('a');
	}, []);
	<span>{'b'}</span>
}

export function RenderRootLoopA(props) @{
	props.swap('b');
	<span>{'render-a'}</span>
}

export function RenderRootLoopB(props) @{
	props.swap('a');
	<span>{'render-b'}</span>
}
