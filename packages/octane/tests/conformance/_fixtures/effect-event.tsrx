import {
	Activity,
	createContext,
	memo,
	use,
	useContext,
	useEffect,
	useEffectEvent,
	useInsertionEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'octane';

export function EffectEventCounter(props) @{
	const [count, setCount] = useState(0);
	const increment = useEffectEvent(() => setCount((value) => value + props.incrementBy));
	props.observe?.(increment);
	<button id="increment" onClick={() => increment()}>
		{count as number}
	</button>
}

export function MultipleEffectEvents(props) @{
	const [count, setCount] = useState(1);
	const add = useEffectEvent(() => setCount((value) => value + props.amount));
	const multiply = useEffectEvent(() => setCount((value) => value * props.amount));
	<>
		<button id="add" onClick={() => add()}>{'add'}</button>
		<button id="multiply" onClick={() => multiply()}>{'multiply'}</button>
		<output>
			{count as number}
		</output>
	</>
}

export function EffectEventThis(props) @{
	const receiver = {
		label: 'receiver',
		readThis() {
			props.observe(this);
		},
	};
	const event = useEffectEvent(receiver.readThis);
	<button onClick={() => event.call(receiver)}>{'call'}</button>
}

export function EffectEventDuringRender() @{
	const event = useEffectEvent(() => 'never');
	event();
	<div />
}

export function LayoutEffectEventCounter(props) @{
	const [count, setCount] = useState(0);
	const increment = useEffectEvent(() => setCount((value) => value + props.incrementBy));
	useLayoutEffect(() => {
		props.log('layout ' + props.incrementBy);
		increment();
	}, [props.incrementBy]);
	<button id="increment" onClick={() => increment()}>
		{count as number}
	</button>
}

export function PassiveEffectEventCounter(props) @{
	const [count, setCount] = useState(0);
	const increment = useEffectEvent(() => setCount((value) => value + props.incrementBy));
	useEffect(() => {
		props.log('passive ' + props.incrementBy);
		increment();
	}, [props.incrementBy]);
	<button id="increment" onClick={() => increment()}>
		{count as number}
	</button>
}

function useEventCount(incrementBy) {
	const [count, setCount] = useState(0);
	const increment = useEffectEvent(() => setCount((value) => value + incrementBy));
	return [count, increment];
}

export function CustomHookEffectEventCounter(props) @{
	const [count, increment] = useEventCount(props.incrementBy);
	useEffect(() => {
		props.log('custom ' + props.incrementBy);
		increment();
	}, [props.incrementBy]);
	<button id="increment" onClick={() => increment()}>
		{count as number}
	</button>
}

export function EffectEventBeforeEffects(props) @{
	useInsertionEffect(() => {
		props.log('insertion ' + props.value);
		readValue();
	}, [props.value]);
	const readValue = useEffectEvent(() => props.log('event ' + props.value));
	<div />
}

function EffectOrderChild(props) @{
	const read = useEffectEvent(() => 'child ' + props.value + ' / ' + props.readParent());
	useInsertionEffect(() => {
		props.log('child insertion create ' + read());
		return () => props.log('child insertion destroy ' + read());
	}, null);
	useLayoutEffect(() => {
		props.log('child layout create ' + read());
		return () => props.log('child layout destroy ' + read());
	}, null);
	useEffect(() => {
		props.log('child passive create ' + read());
		return () => props.log('child passive destroy ' + read());
	}, null);
	<div />
}

export function EffectEventOrder(props) @{
	const read = useEffectEvent(() => 'parent ' + props.value);
	useInsertionEffect(() => {
		props.log('parent insertion create ' + read());
		return () => props.log('parent insertion destroy ' + read());
	}, null);
	useLayoutEffect(() => {
		props.log('parent layout create ' + read());
		return () => props.log('parent layout destroy ' + read());
	}, null);
	useEffect(() => {
		props.log('parent passive create ' + read());
		return () => props.log('parent passive destroy ' + read());
	}, null);
	<EffectOrderChild value={props.value} readParent={read} log={props.log} />
}

function ActivityMutationChild(props) @{
	const read = useEffectEvent(() => props.readParent() + ' child ' + props.value);
	useInsertionEffect(() => {
		props.log('child insertion ' + read());
	}, [props.value]);
	useLayoutEffect(() => {
		props.log('child layout ' + read());
		return () => props.log('child layout destroy ' + read());
	}, [props.value]);
	<div class="activity-child" />
}

export function ActivityEffectEventMutation(props) @{
	const read = useEffectEvent(() => 'parent ' + props.value);
	<Activity mode={props.mode}>
		<ActivityMutationChild value={props.value} readParent={read} log={props.log} />
	</Activity>
}

function EffectEventIdentityChildImpl(props) @{
	props.observe(props.event);
	<span />
}
const EffectEventIdentityChild = memo(EffectEventIdentityChildImpl);

export function EffectEventMemoPropIdentity(props) @{
	const [value, setValue] = useState(1);
	const event = useEffectEvent(() => value);
	<>
		<EffectEventIdentityChild event={event} observe={props.observe} />
		<button onClick={() => setValue(value + 1)}>
			{value as number}
		</button>
	</>
}

function CommittedEventChild(props) @{
	const event = useEffectEvent(() => props.value);
	props.observe(event);
	if (props.error) throw new Error('render failed');
	if (props.resource) use(props.resource);
	<span class="value">
		{props.value as string}
	</span>
}

export function CommittedEventBoundary(props) @{
	@try {
		<CommittedEventChild
			value={props.value}
			resource={props.resource}
			error={props.error}
			observe={props.observe}
		/>
	} @pending {
		<span class="pending">{'pending'}</span>
	} @catch (error) {
		<span class="caught">
			{error.message as string}
		</span>
	}
}

function RegisteredSiblingEvent(props) @{
	const read = useEffectEvent(() => props.value);
	useEffect(() => {
		props.eventRef.current = read;
		return () => {
			if (props.eventRef.current === read) props.eventRef.current = null;
		};
	}, []);
	<span class="registered-sibling">
		{props.value as string}
	</span>
}

function LaterSuspendingSibling(props) @{
	if (props.resource) use(props.resource);
	<span class="later-sibling">{'ready'}</span>
}

export function SiblingSuspenseEventBoundary(props) @{
	@try {
		<>
			<RegisteredSiblingEvent value={props.value} eventRef={props.eventRef} />
			<LaterSuspendingSibling resource={props.resource} />
		</>
	} @pending {
		<span class="sibling-pending">{'pending'}</span>
	}
}

function IndependentlyUpdatedEventSibling(props) @{
	const [value, setValue] = useState('committed');
	props.setValueRef.current = setValue;
	const read = useEffectEvent(() => value);
	useEffect(() => {
		props.eventRef.current = read;
		return () => {
			if (props.eventRef.current === read) props.eventRef.current = null;
		};
	}, []);
	<span class="independent-event-sibling">
		{value as string}
	</span>
}

function IndependentlySuspendingSibling(props) @{
	const [resource, setResource] = useState(null);
	props.setResourceRef.current = setResource;
	if (resource) use(resource);
	<span class="independent-suspending-sibling">{'ready'}</span>
}

export function IndependentSiblingSuspenseEventBoundary(props) @{
	@try {
		<>
			<IndependentlyUpdatedEventSibling eventRef={props.eventRef} setValueRef={props.setValueRef} />
			<IndependentlySuspendingSibling setResourceRef={props.setResourceRef} />
		</>
	} @pending {
		<span class="independent-sibling-pending">{'pending'}</span>
	}
}

function ConditionalEventCleanupChild(props) @{
	const read = useEffectEvent(() => props.value);
	const elementRef = useRef(null);
	useLayoutEffect(() => {
		return () => props.log('cleanup ' + read() + ' connected=' + elementRef.current.isConnected);
	}, []);
	<span ref={elementRef} class="conditional-event-child">
		{props.value as string}
	</span>
}

export function ConditionalEventCleanup(props) @{
	@if (props.show) {
		<ConditionalEventCleanupChild value={props.value} log={props.log} />
	} @else {
		<span class="conditional-event-empty">{'empty'}</span>
	}
}

export function EffectEventChatRoom(props) @{
	const onConnected = useEffectEvent(() => props.log('connected ' + props.theme));
	useEffect(() => {
		return props.connection.connect(props.roomId, () => onConnected());
	}, [props.roomId, props.connection]);
	<div>
		{props.roomId as string}
	</div>
}

export function EffectEventLogVisit(props) @{
	const [items, setItems] = useState([]);
	const addItem = useEffectEvent(() => setItems([...items, 1]));
	const onVisit = useEffectEvent((url) => props.log(url + ' items=' + items.length));
	useEffect(() => {
		onVisit(props.url);
	}, [props.url]);
	<button id="add" onClick={() => addItem()}>
		{items.length as number}
	</button>
}

const EffectEventContext = createContext('default');

function MemoContextReaderImpl(props) @{
	const value = useContext(EffectEventContext);
	const read = useEffectEvent(() => value);
	useEffect(() => {
		props.eventRef.current = read;
	}, []);
	<div>
		{value as string}
	</div>
}
const MemoContextReader = memo(MemoContextReaderImpl);

export function MemoContextEffectEvent(props) @{
	<EffectEventContext.Provider value={props.value}>
		<MemoContextReader eventRef={props.eventRef} />
	</EffectEventContext.Provider>
}

function RefPropContextReader(props) @{
	const value = useContext(EffectEventContext);
	const read = useEffectEvent(() => value);
	useEffect(() => {
		props.ref.current = read;
	}, []);
	<div>
		{value as string}
	</div>
}

export function RefPropContextEffectEvent(props) @{
	<EffectEventContext.Provider value={props.value}>
		<RefPropContextReader ref={props.eventRef} />
	</EffectEventContext.Provider>
}

export function ServerEffectEventDeclaration() @{
	const onClick = useEffectEvent(() => {});
	<button class="server-effect-event" onClick={() => onClick()}>{'ready'}</button>
}

export function ServerEffectEventInvocation() @{
	const onRender = useEffectEvent(() => {});
	onRender();
	<p>{'unreachable'}</p>
}

export function ServerEffectEventIdentity() {
	const first = useEffectEvent(() => {});
	const second = useEffectEvent(() => {});
	if (first === second) return <div class="server-effect-event-shared" />;
	return <span class="server-effect-event-distinct" />;
}

function FreshActivityChild(props) @{
	const read = useEffectEvent(() => props.value);
	useInsertionEffect(() => {
		props.log('insertion create ' + read());
		return () => props.log('insertion destroy ' + read());
	}, null);
	useLayoutEffect(() => {
		props.log('layout create ' + read());
		return () => props.log('layout destroy ' + read());
	}, null);
	<div />
}

export function FreshActivityEffectEvent(props) @{
	<Activity mode={props.mode}>
		<FreshActivityChild value={props.value} log={props.log} />
	</Activity>
}
