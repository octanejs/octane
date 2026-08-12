import { cloneElement, useRef, useState, type ElementDescriptor } from 'octane';
import {
	CSSTransition,
	ReplaceTransition,
	SwitchTransition,
	Transition,
	TransitionGroup,
} from '../../src/index.ts';

export function TransitionFixture(props: { trace: string[] }) @{
	const [shown, setShown] = useState(false);
	<main>
		<button id="toggle" onClick={() => setShown((value) => !value)}>{'toggle'}</button>
		<Transition
			in={shown}
			timeout={20}
			onEnter={() => props.trace.push('enter')}
			onEntering={() => props.trace.push('entering')}
			onEntered={() => props.trace.push('entered')}
			onExit={() => props.trace.push('exit')}
			onExiting={() => props.trace.push('exiting')}
			onExited={() => props.trace.push('exited')}
		>
			{(status) => <span id="state" data-state={status}>{status}</span>}
		</Transition>
	</main>
}

export function CSSFixture() @{
	const [shown, setShown] = useState(false);
	const nodeRef = useRef<HTMLDivElement | null>(null);
	<main>
		<button id="css-toggle" onClick={() => setShown((value) => !value)}>{'toggle'}</button>
		<CSSTransition nodeRef={nodeRef} in={shown} timeout={20} classNames="fade">
			<div id="css-node" ref={nodeRef}>{'content'}</div>
		</CSSTransition>
	</main>
}

export function GroupFixture(props: { trace: string[] }) @{
	const [items, setItems] = useState(['one', 'two']);
	<main>
		<button id="remove-first" onClick={() => setItems(['two'])}>{'remove'}</button>
		<TransitionGroup
			component="section"
			id="group"
			children={items.map(
				(id) => <Transition key={id} timeout={20} onExited={() => props.trace.push(`exited:${id}`)}>
					{(status) => <span data-item={id} data-state={status}>{id}</span>}
				</Transition>,
			)}
		/>
	</main>
}

export function ClonedTransitionFixture(props: { trace: string[] }) @{
	const [shown, setShown] = useState(true);
	const original = useRef<ElementDescriptor | null>(null);
	if (original.current === null) {
		original.current = <Transition
			key="stable"
			timeout={20}
			onExited={() => props.trace.push('exited')}
		>
			{(status) => <span id="cloned-state">{status}</span>}
		</Transition>;
	}
	const child = cloneElement(original.current, { in: shown });
	<main>
		<button id="clone-toggle" onClick={() => setShown(false)}>{'hide'}</button>
		{child}
	</main>
}

export function NodeRefAppearFixture(props: { calls: unknown[][] }) @{
	const nodeRef = useRef<HTMLDivElement | null>(null);
	<Transition
		in
		appear
		nodeRef={nodeRef}
		timeout={20}
		onEnter={((...args: unknown[]) => props.calls.push(args)) as any}
	>
		<div id="appear-node" ref={nodeRef}>{'appear'}</div>
	</Transition>
}

export function NullNodeRefFixture(props: { trace: string[] }) @{
	const nodeRef = useRef<HTMLDivElement | null>(null);
	<Transition
		in
		appear
		nodeRef={nodeRef}
		timeout={1_000}
		addEndListener={() => props.trace.push('listener')}
		onEntered={() => props.trace.push('entered')}
	>
		<div id="null-ref-node">{'no attached ref'}</div>
	</Transition>
}

export function CSSNodeRefAppearFixture(props: { calls: unknown[][] }) @{
	const nodeRef = useRef<HTMLDivElement | null>(null);
	<CSSTransition
		in
		appear
		nodeRef={nodeRef}
		timeout={20}
		classNames="appear"
		onEnter={((...args: unknown[]) => props.calls.push(args)) as any}
	>
		<div id="css-appear-node" ref={nodeRef}>{'appear'}</div>
	</CSSTransition>
}

export function LatestCompletionFixture(props: { trace: string[] }) @{
	const [shown, setShown] = useState(false);
	const [version, setVersion] = useState('first');
	<main>
		<button id="latest-start" onClick={() => setShown(true)}>{'start'}</button>
		<button id="latest-swap" onClick={() => setVersion('second')}>{'swap'}</button>
		<Transition in={shown} timeout={20} onEntered={() => props.trace.push(version)}>
			<span id="latest-state">{version}</span>
		</Transition>
	</main>
}

export function MountOnEnterFixture() @{
	const [shown, setShown] = useState(false);
	const nodeRef = useRef<HTMLDivElement | null>(null);
	<main>
		<button id="mount-toggle" onClick={() => setShown(true)}>{'show'}</button>
		<CSSTransition nodeRef={nodeRef} in={shown} mountOnEnter timeout={20} classNames="mount">
			<div id="mounted-node" ref={nodeRef}>{'mounted'}</div>
		</CSSTransition>
	</main>
}

export function SameKeyGroupFixture() @{
	const [label, setLabel] = useState('first');
	const child = <Transition key="stable" timeout={0}>
		<span id="same-key-label">{label}</span>
	</Transition>;
	<main>
		<button id="same-key-update" onClick={() => setLabel('second')}>{'update'}</button>
		<TransitionGroup children={[child]} />
	</main>
}

function GroupFlagProbe(props: { enter?: boolean }) @{
	<span id="group-flag" data-enter={String(props.enter)}>{'flag'}</span>
}

export function StableChildrenGroupFlagsFixture() @{
	const [enter, setEnter] = useState(true);
	const child = useRef<ElementDescriptor | null>(null);
	if (child.current === null) child.current = <GroupFlagProbe key="stable-flag" />;
	<main>
		<button id="group-flag-toggle" onClick={() => setEnter(false)}>{'toggle flag'}</button>
		<TransitionGroup enter={enter} children={[child.current]} />
	</main>
}

export function SwitchFixture(props: { mode: 'out-in' | 'in-out' }) @{
	const [second, setSecond] = useState(false);
	const id = second ? 'second' : 'first';
	const child = <Transition key={id} timeout={20}>
		{(status) => <span data-switch={id} data-state={status}>{id}</span>}
	</Transition>;
	<main>
		<button id="switch-toggle" onClick={() => setSecond(true)}>{'switch'}</button>
		<SwitchTransition mode={props.mode} children={child} />
	</main>
}

export function SameKeySwitchFixture() @{
	const [label, setLabel] = useState('first');
	const child = <Transition key="stable" timeout={0}>
		<span id="same-key-switch-label">{label}</span>
	</Transition>;
	<main>
		<button id="same-key-switch-update" onClick={() => setLabel('second')}>{'update'}</button>
		<SwitchTransition children={child} />
	</main>
}

export function ReplaceFixture() @{
	const [first, setFirst] = useState(true);
	const children = [
		<Transition key="first" timeout={20}>
			<span data-replace="first">{'first'}</span>
		</Transition>,
		<Transition key="second" timeout={20}>
			<span data-replace="second">{'second'}</span>
		</Transition>,
	];
	<main>
		<button id="replace-toggle" onClick={() => setFirst(false)}>{'replace'}</button>
		<ReplaceTransition in={first} children={children} />
	</main>
}
