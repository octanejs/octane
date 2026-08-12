import { useRef } from 'octane';
import Transition from './Transition.tsrx';
import type { CSSClassNames, CSSTransitionProps } from './types.ts';
import { forceReflow } from './utils/reflow.ts';

type TransitionType = 'appear' | 'enter' | 'exit';
type Phase = 'base' | 'active' | 'done';
type AppliedClasses = Record<TransitionType, Partial<Record<Phase, string>>>;

function classesFor(classNames: CSSClassNames | undefined, type: TransitionType) {
	if (typeof classNames === 'string' || classNames === undefined) {
		const prefix = classNames ? `${classNames}-` : '';
		const base = `${prefix}${type}`;
		return { base, active: `${base}-active`, done: `${base}-done` };
	}
	return {
		base: classNames[type],
		active: classNames[`${type}Active`],
		done: classNames[`${type}Done`],
	};
}

function addClasses(node: Element | null | undefined, value: string | undefined) {
	if (!node || !value) return;
	for (const className of value.split(' ')) if (className) node.classList.add(className);
}

function removeClasses(node: Element | null | undefined, value: string | undefined) {
	if (!node || !value) return;
	for (const className of value.split(' ')) if (className) node.classList.remove(className);
}

export function CSSTransition(props: CSSTransitionProps) @{
	const applied = useRef<AppliedClasses>({ appear: {}, enter: {}, exit: {} });
	const node = () => props.nodeRef?.current;
	const resolveEnterArguments = (maybeNode?: Element | boolean, maybeAppearing?: boolean) =>
		props.nodeRef
			? { node: props.nodeRef.current, appearing: maybeNode === true }
			: { node: maybeNode as Element | undefined, appearing: maybeAppearing === true };

	const clear = (type: TransitionType) => {
		const current = applied.current[type];
		removeClasses(node(), current.base);
		removeClasses(node(), current.active);
		removeClasses(node(), current.done);
		applied.current[type] = {};
	};

	const add = (type: TransitionType, phase: Phase) => {
		let className = classesFor(props.classNames, type)[phase];
		if (type === 'appear' && phase === 'done') {
			const enterDone = classesFor(props.classNames, 'enter').done;
			if (enterDone) className = className ? `${className} ${enterDone}` : enterDone;
		}
		if (phase === 'active' && node()) forceReflow(node()!);
		if (className) {
			applied.current[type][phase] = className;
			addClasses(node(), className);
		}
	};

	const {
		children,
		classNames: _classNames,
		onEnter,
		onEntering,
		onEntered,
		onExit,
		onExiting,
		onExited,
		...transitionProps
	} = props;

	<Transition
		{...transitionProps}
		onEnter={(maybeNode, maybeAppearing) => {
			const { appearing } = resolveEnterArguments(maybeNode, maybeAppearing);
			clear('exit');
			add(appearing ? 'appear' : 'enter', 'base');
			onEnter?.(maybeNode, maybeAppearing);
		}}
		onEntering={(maybeNode, maybeAppearing) => {
			const { appearing } = resolveEnterArguments(maybeNode, maybeAppearing);
			add(appearing ? 'appear' : 'enter', 'active');
			onEntering?.(maybeNode, maybeAppearing);
		}}
		onEntered={(maybeNode, maybeAppearing) => {
			const { appearing } = resolveEnterArguments(maybeNode, maybeAppearing);
			const type = appearing ? 'appear' : 'enter';
			clear(type);
			add(type, 'done');
			onEntered?.(maybeNode, maybeAppearing);
		}}
		onExit={(maybeNode) => {
			clear('appear');
			clear('enter');
			add('exit', 'base');
			onExit?.(maybeNode);
		}}
		onExiting={(maybeNode) => {
			add('exit', 'active');
			onExiting?.(maybeNode);
		}}
		onExited={(maybeNode) => {
			clear('exit');
			add('exit', 'done');
			onExited?.(maybeNode);
		}}
	>{children}</Transition>
}

export default CSSTransition;
