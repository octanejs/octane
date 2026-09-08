/*!---------------------------------------------------------------------------------------------
 *  Copyright (c) StackBlitz. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	type OctaneNode,
	createContext,
	isChildrenBlock,
	useCallback,
	useContext,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
} from 'octane';
import {
	type GetTargetScrollTop,
	type StickToBottomInstance,
	type StickToBottomOptions,
	type StickToBottomState,
	type ScrollToBottom,
	type StopScroll,
	useStickToBottom,
} from './useStickToBottom';

type DivProps = import('octane/jsx-runtime').Octane.JSX.IntrinsicElements['div'];

export interface StickToBottomContext {
	contentRef: StickToBottomInstance['contentRef'];
	scrollRef: StickToBottomInstance['scrollRef'];
	scrollToBottom: ScrollToBottom;
	stopScroll: StopScroll;
	isAtBottom: boolean;
	escapedFromLock: boolean;
	get targetScrollTop(): GetTargetScrollTop | null;
	set targetScrollTop(targetScrollTop: GetTargetScrollTop | null);
	state: StickToBottomState;
}

const StickToBottomContext = createContext<StickToBottomContext | null>(null);

type StickToBottomContextRef =
	{ current: StickToBottomContext | null } | ((value: StickToBottomContext | null) => void);

export interface StickToBottomProps extends Omit<DivProps, 'children'>, StickToBottomOptions {
	contextRef?: StickToBottomContextRef;
	instance?: StickToBottomInstance;
	children: ((context: StickToBottomContext) => OctaneNode) | OctaneNode;
}

const useIsomorphicLayoutEffect =
	typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function StickToBottom({
	instance,
	children,
	resize,
	initial,
	mass,
	damping,
	stiffness,
	targetScrollTop: currentTargetScrollTop,
	contextRef,
	...props
}: StickToBottomProps) {
	const customTargetScrollTop = useRef<GetTargetScrollTop | null>(null);

	const targetScrollTop = useCallback<GetTargetScrollTop>(
		function getTargetScrollTop(target, elements) {
			const get = context?.targetScrollTop ?? currentTargetScrollTop;
			return get?.(target, elements) ?? target;
		},
		[currentTargetScrollTop],
	);

	const defaultInstance = useStickToBottom({
		mass,
		damping,
		stiffness,
		resize,
		initial,
		targetScrollTop,
	});

	const { scrollRef, contentRef, scrollToBottom, stopScroll, isAtBottom, escapedFromLock, state } =
		instance ?? defaultInstance;

	const context = useMemo(function createContextValue(): StickToBottomContext {
		return {
			scrollToBottom,
			stopScroll,
			scrollRef,
			isAtBottom,
			escapedFromLock,
			contentRef,
			state,
			get targetScrollTop() {
				return customTargetScrollTop.current;
			},
			set targetScrollTop(next: GetTargetScrollTop | null) {
				customTargetScrollTop.current = next;
			},
		};
	}, [
		scrollToBottom,
		isAtBottom,
		contentRef,
		scrollRef,
		stopScroll,
		escapedFromLock,
		state,
	]);

	useImperativeHandle(contextRef, function getContext() {
		return context;
	}, [context]);

	useIsomorphicLayoutEffect(function ensureOverflow() {
		if (!scrollRef.current) {
			return;
		}

		if (getComputedStyle(scrollRef.current).overflow === 'visible') {
			scrollRef.current.style.overflow = 'auto';
		}
	}, []);

	return <StickToBottomContext.Provider value={context}>
		<div {...props}>
			{typeof children === 'function' && !isChildrenBlock(children) ? children(context) : children}
		</div>
	</StickToBottomContext.Provider>;
}

export interface StickToBottomContentProps extends Omit<DivProps, 'children'> {
	children: ((context: StickToBottomContext) => OctaneNode) | OctaneNode;
	scrollClassName?: string;
}

export function StickToBottomContent({
	children,
	scrollClassName,
	...props
}: StickToBottomContentProps) {
	const context = useStickToBottomContext();

	return <div
		ref={context.scrollRef}
		style={{
			height: '100%',
			width: '100%',
			scrollbarGutter: 'stable both-edges',
		}}
		className={scrollClassName}
	>
		<div {...props} ref={context.contentRef}>
			{typeof children === 'function' && !isChildrenBlock(children) ? children(context) : children}
		</div>
	</div>;
}

StickToBottom.Content = StickToBottomContent;

export function useStickToBottomContext(): StickToBottomContext {
	const context = useContext(StickToBottomContext);
	if (!context) {
		throw new Error('use-stick-to-bottom component context must be used within a StickToBottom component');
	}

	return context;
}
