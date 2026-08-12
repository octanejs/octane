import { Children, cloneElement, useRef, type ElementDescriptor } from 'octane';
import {
	CSSTransition,
	SwitchTransition,
	Transition,
	TransitionGroup,
	type CSSClassNames,
	type TransitionTimeout,
} from '../../src/index.ts';

export type TransitionProbeProps = {
	shown: boolean;
	timeout?: TransitionTimeout;
	appear?: boolean;
	enter?: boolean;
	exit?: boolean;
	mountOnEnter?: boolean;
	unmountOnExit?: boolean;
	addEndListener?: ((done: () => void) => void) | ((node: Element, done: () => void) => void);
	onEnter?: (node?: Element, isAppearing?: boolean) => void;
	onEntering?: (node?: Element, isAppearing?: boolean) => void;
	onEntered?: (node?: Element, isAppearing?: boolean) => void;
	onExit?: (node?: Element) => void;
	onExiting?: (node?: Element) => void;
	onExited?: (node?: Element) => void;
	foo?: string;
	bar?: string;
};

export function TransitionStatusProbe(props: TransitionProbeProps) @{
	const nodeRef = useRef<HTMLDivElement | null>(null);
	<Transition
		in={props.shown}
		nodeRef={nodeRef}
		timeout={props.timeout ?? 10}
		appear={props.appear}
		enter={props.enter}
		exit={props.exit}
		mountOnEnter={props.mountOnEnter}
		unmountOnExit={props.unmountOnExit}
		addEndListener={props.addEndListener}
		onEnter={props.onEnter}
		onEntering={props.onEntering}
		onEntered={props.onEntered}
		onExit={props.onExit}
		onExiting={props.onExiting}
		onExited={props.onExited}
		foo={props.foo}
		bar={props.bar}
	>
		{(status) => <div ref={nodeRef} id="status">{'status: ' + status}</div>}
	</Transition>
}

export function TransitionChildPropsProbe(props: TransitionProbeProps) @{
	const nodeRef = useRef<HTMLDivElement | null>(null);
	<Transition
		in={props.shown}
		nodeRef={nodeRef}
		timeout={props.timeout ?? 0}
		mountOnEnter={props.mountOnEnter}
		unmountOnExit={props.unmountOnExit}
		appear={props.appear}
		enter={props.enter}
		exit={props.exit}
		foo={props.foo}
		bar={props.bar}
	>
		{(_status, childProps) =>
			<div ref={nodeRef} id="filtered">
				{'foo: ' + String(childProps.foo) + ', bar: ' + String(childProps.bar)}
			</div>}
	</Transition>
}

export type CSSProbeProps = {
	shown: boolean;
	timeout?: TransitionTimeout;
	appear?: boolean;
	classNames?: CSSClassNames;
	className?: string;
	onEnter?: (node?: Element, isAppearing?: boolean) => void;
	onEntering?: (node?: Element, isAppearing?: boolean) => void;
	onEntered?: (node?: Element, isAppearing?: boolean) => void;
	onExit?: (node?: Element) => void;
	onExiting?: (node?: Element) => void;
	onExited?: (node?: Element) => void;
};

export function CSSTransitionProbe(props: CSSProbeProps) @{
	const nodeRef = useRef<HTMLDivElement | null>(null);
	<CSSTransition
		in={props.shown}
		nodeRef={nodeRef}
		timeout={props.timeout ?? 10}
		appear={props.appear}
		classNames={props.classNames}
		className={props.className}
		onEnter={props.onEnter}
		onEntering={props.onEntering}
		onEntered={props.onEntered}
		onExit={props.onExit}
		onExiting={props.onExiting}
		onExited={props.onExited}
	>
		<div ref={nodeRef} id="css-node" class={props.className} />
	</CSSTransition>
}

export type YoloProps = {
	id: string;
	timeout?: number;
	classNames?: string;
};

export function YoloTransition(props: YoloProps & Record<string, unknown>) @{
	const nodeRef = useRef<HTMLSpanElement | null>(null);
	const { id, classNames, timeout, className, ...rest } = props as
		YoloProps & {
			className?: string;
		} & Record<string, unknown>;
	<CSSTransition
		nodeRef={nodeRef}
		classNames={classNames as string ?? 'yolo'}
		timeout={timeout as number ?? 0}
		className={className as string | undefined}
		{...rest}
	>
		<span ref={nodeRef} id={id as string} class={className as string | undefined} />
	</CSSTransition>
}

export type GroupProbeProps = {
	items: Array<string | null>;
	enter?: boolean;
	exit?: boolean;
	appear?: boolean;
	component?: any;
	childFactory?: (child: ElementDescriptor) => ElementDescriptor;
};

export function CSSTransitionGroupProbe(props: GroupProbeProps) @{
	const children = props.items.filter(function keep(item) {
		return item != null;
	}).map(function toChild(id) {
		return <YoloTransition key={id as string} id={id as string} />;
	});
	<TransitionGroup
		enter={props.enter}
		exit={props.exit}
		appear={props.appear}
		component={props.component}
		childFactory={props.childFactory}
		children={children}
	/>
}

function CallbackRefChild(props: { ref?: (node: HTMLSpanElement | null) => void }) @{
	<span ref={props.ref} id="callback-ref-child" />
}

export function CallbackRefGroupProbe(props: {
	onRef: (node: HTMLSpanElement | null) => void;
}) @{
	<TransitionGroup children={[<CallbackRefChild key="child" ref={props.onRef} />]} />
}

function NullRenderChild() {
	return null;
}

export function NullRenderGroupProbe(props: { active: boolean }) @{
	const child =
		props.active
			? <CSSTransition key="null-child" classNames="yolo" timeout={0}>
					<NullRenderChild />
				</CSSTransition>
			: null;
	<TransitionGroup children={child} />
}

function ConditionalHostChild(props: { show: boolean }) {
	if (!props.show) return null;
	return <div id="conditional-host" />;
}

export function ConditionalHostGroupProbe(props: { show: boolean }) @{
	<TransitionGroup
		appear={true}
		children={<CSSTransition key="child" classNames="yolo" timeout={0} appear>
			<ConditionalHostChild show={props.show} />
		</CSSTransition>}
	/>
}

export function CloningWrapper(props: { children?: unknown }) @{
	const mapped = Children.map(props.children, function cloneChild(child) {
		if (child == null) return null;
		return cloneElement(child as ElementDescriptor, { className: 'wrapper-item' });
	});
	<div>{mapped}</div>
}

export type ReenterGroupProbeProps = {
	text: string;
	direction: string;
	nodeRef: { current: HTMLSpanElement | null };
	timeout?: number;
	onEnter?: (node?: Element, isAppearing?: boolean) => void;
	onEntering?: (node?: Element, isAppearing?: boolean) => void;
	onEntered?: (node?: Element, isAppearing?: boolean) => void;
};

export function CSSTransitionReenterGroupProbe(props: ReenterGroupProbeProps) @{
	<TransitionGroup
		component={null}
		childFactory={function applyDirection(child: ElementDescriptor) {
			return cloneElement(child, { classNames: props.direction });
		}}
		children={<CSSTransition
			key={props.text}
			timeout={props.timeout ?? 100}
			nodeRef={props.nodeRef}
			onEnter={props.onEnter}
			onEntering={props.onEntering}
			onEntered={props.onEntered}
		>
			<span ref={props.nodeRef} id={'reenter-' + props.text}>{props.text as string}</span>
		</CSSTransition>}
	/>
}

export type SwitchProbeProps = {
	keyId: string | null;
	mode?: 'out-in' | 'in-out';
	onEnter?: (node?: Element, isAppearing?: boolean) => void;
	onEntering?: (node?: Element, isAppearing?: boolean) => void;
	onEntered?: (node?: Element, isAppearing?: boolean) => void;
	onExit?: (node?: Element) => void;
	onExiting?: (node?: Element) => void;
	onExited?: (node?: Element) => void;
};

export function SwitchTransitionProbe(props: SwitchProbeProps) @{
	const nodeRef = useRef<HTMLSpanElement | null>(null);
	const child =
		props.keyId == null
			? null
			: <Transition
					key={props.keyId}
					nodeRef={nodeRef}
					timeout={0}
					onEnter={props.onEnter}
					onEntering={props.onEntering}
					onEntered={props.onEntered}
					onExit={props.onExit}
					onExiting={props.onExiting}
					onExited={props.onExited}
				>
					{(status) =>
						<span ref={nodeRef} id="switch-status">{props.keyId + ' status: ' + status}</span>}
				</Transition>;
	<SwitchTransition mode={props.mode} children={child} />
}

export function SwitchTransitionStaticChildProbe() @{
	const nodeRef = useRef<HTMLSpanElement | null>(null);
	<SwitchTransition
		children={<Transition key="first" nodeRef={nodeRef} timeout={0}>
			<span ref={nodeRef} />
		</Transition>}
	/>
}

export type GroupChildProbeProps = {
	count: number;
	log: string[];
};

export function TransitionGroupCountProbe(props: GroupChildProbeProps) @{
	const children = [];
	for (let i = 0; i < props.count; i++) {
		const nodeRef = { current: null as HTMLSpanElement | null };
		children.push(
			<Transition
				key={String(i)}
				nodeRef={nodeRef}
				timeout={0}
				onEnter={function onEnter(isAppearing?: Element | boolean) {
					props.log.push(isAppearing === true ? 'appear' : 'enter');
				}}
				onEntering={function onEntering(isAppearing?: Element | boolean) {
					props.log.push(isAppearing === true ? 'appearing' : 'entering');
				}}
				onEntered={function onEntered(isAppearing?: Element | boolean) {
					props.log.push(isAppearing === true ? 'appeared' : 'entered');
				}}
				onExit={function onExit() {
					props.log.push('exit');
				}}
				onExiting={function onExiting() {
					props.log.push('exiting');
				}}
				onExited={function onExited() {
					props.log.push('exited');
				}}
			>
				<span ref={nodeRef} data-child={String(i)} />
			</Transition>,
		);
	}
	<TransitionGroup appear={true} enter={true} exit={true} children={children} />
}

export type ReAddOnExitedGroupProbeProps = {
	show: boolean;
	log: string[];
	onShowChange: (show: boolean) => void;
};

export function ReAddOnExitedGroupProbe(props: ReAddOnExitedGroupProbeProps) @{
	const nodeRef = useRef<HTMLSpanElement | null>(null);
	const child =
		props.show
			? <Transition
					key="child"
					nodeRef={nodeRef}
					timeout={0}
					onEnter={function onEnter(isAppearing?: Element | boolean) {
						props.log.push(isAppearing === true ? 'appear' : 'enter');
					}}
					onEntering={function onEntering(isAppearing?: Element | boolean) {
						props.log.push(isAppearing === true ? 'appearing' : 'entering');
					}}
					onEntered={function onEntered(isAppearing?: Element | boolean) {
						props.log.push(isAppearing === true ? 'appeared' : 'entered');
					}}
					onExit={function onExit() {
						props.log.push('exit');
					}}
					onExiting={function onExiting() {
						props.log.push('exiting');
					}}
					onExited={function onExited() {
						props.log.push('exited');
						props.onShowChange(true);
					}}
				>
					<span ref={nodeRef} id="readd-child" />
				</Transition>
			: null;
	<TransitionGroup appear={true} enter={true} exit={true} children={child} />
}
