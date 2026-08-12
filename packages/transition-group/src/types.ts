import type { ComponentBody, ElementDescriptor, OctaneNode } from 'octane';

export type TransitionStatus = 'unmounted' | 'exited' | 'entering' | 'entered' | 'exiting';
export type TransitionTimeout = number | { appear?: number; enter?: number; exit?: number };
export type TransitionNodeRef = { current: HTMLElement | null };

export interface TransitionCallbacks {
	onEnter?: (...args: any[]) => void;
	onEntering?: (...args: any[]) => void;
	onEntered?: (...args: any[]) => void;
	onExit?: (...args: any[]) => void;
	onExiting?: (...args: any[]) => void;
	onExited?: (...args: any[]) => void;
}

export interface TransitionProps extends TransitionCallbacks {
	children?:
		| ElementDescriptor
		| ((status: TransitionStatus, childProps?: Record<string, unknown>) => OctaneNode);
	in?: boolean;
	mountOnEnter?: boolean;
	unmountOnExit?: boolean;
	appear?: boolean;
	enter?: boolean;
	exit?: boolean;
	timeout?: TransitionTimeout;
	addEndListener?: (...args: any[]) => void;
	nodeRef?: TransitionNodeRef;
	[key: string]: unknown;
}

export type TransitionComponent = ComponentBody<TransitionProps> & {
	UNMOUNTED: 'unmounted';
	EXITED: 'exited';
	ENTERING: 'entering';
	ENTERED: 'entered';
	EXITING: 'exiting';
};

export type CSSClassNames =
	| string
	| {
			appear?: string;
			appearActive?: string;
			appearDone?: string;
			enter?: string;
			enterActive?: string;
			enterDone?: string;
			exit?: string;
			exitActive?: string;
			exitDone?: string;
	  };

export interface CSSTransitionProps extends TransitionProps {
	classNames?: CSSClassNames;
}

export interface TransitionGroupProps {
	children?: OctaneNode;
	component?: ComponentBody<any> | ((props: any) => unknown) | string | null;
	childFactory?: (child: ElementDescriptor) => ElementDescriptor;
	appear?: boolean;
	enter?: boolean;
	exit?: boolean;
	[key: string]: unknown;
}

export interface SwitchTransitionProps {
	children?: ElementDescriptor | null;
	mode?: 'out-in' | 'in-out';
}

export interface ReplaceTransitionProps extends TransitionCallbacks {
	children: OctaneNode;
	in: boolean;
	[key: string]: unknown;
}
