import type React from 'react';
import type {
	Boundary,
	FlipOptions,
	HideOptions,
	Middleware,
	MiddlewareData,
	OffsetOptions,
	Padding,
	Placement,
	ReferenceElement,
	ShiftOptions,
	SizeOptions,
	Strategy,
	VirtualElement,
} from '@floating-ui/dom';

export type {
	Boundary,
	FlipOptions,
	HideOptions,
	Middleware,
	MiddlewareData,
	OffsetOptions,
	Padding,
	Placement,
	ReferenceElement,
	ShiftOptions,
	SizeOptions,
	Strategy,
	VirtualElement,
};

export type OpenChangeReason =
	| 'outside-press'
	| 'escape-key'
	| 'ancestor-scroll'
	| 'reference-press'
	| 'click'
	| 'hover'
	| 'focus'
	| 'focus-out'
	| 'list-navigation'
	| 'safe-polygon';

export type Delay = number | Partial<{ open: number; close: number }>;

export type UseHoverProps = {
	enabled?: boolean;
	handleClose?: ((context: unknown) => (event: MouseEvent) => void) | null;
	restMs?: number | (() => number);
	delay?: Delay | (() => Delay);
	mouseOnly?: boolean;
	move?: boolean;
};

export type UseFocusProps = {
	enabled?: boolean;
	visibleOnly?: boolean;
};

export type UseDismissProps = {
	enabled?: boolean;
	escapeKey?: boolean;
	outsidePress?: boolean | ((event: MouseEvent) => boolean);
	outsidePressEvent?: 'pointerdown' | 'mousedown' | 'click';
	referencePress?: boolean;
	referencePressEvent?: 'pointerdown' | 'mousedown' | 'click';
	ancestorScroll?: boolean;
	bubbles?: boolean | { escapeKey?: boolean; outsidePress?: boolean };
	capture?: boolean | { escapeKey?: boolean; outsidePress?: boolean };
};

export type UseRoleProps = {
	enabled?: boolean;
	role?:
		| 'tooltip'
		| 'dialog'
		| 'alertdialog'
		| 'menu'
		| 'listbox'
		| 'grid'
		| 'tree'
		| 'label'
		| 'select'
		| 'combobox';
};

export type UseFloatingOptions = {
	whileElementsMounted?: (
		reference: ReferenceElement,
		floating: HTMLElement,
		update: () => void,
	) => void | (() => void);
};

type MutableReference<T> = { current: T };

export type UseFloatingReturn<RT extends ReferenceElement = ReferenceElement> = {
	x: number;
	y: number;
	placement: Placement;
	strategy: Strategy;
	floatingStyles: React.CSSProperties;
	middlewareData: MiddlewareData;
	update: () => void;
	refs: {
		reference: MutableReference<RT | null>;
		floating: MutableReference<HTMLElement | null>;
		domReference: MutableReference<Element | null>;
		setReference: (node: RT | null) => void;
		setPositionReference: (node: RT | null) => void;
		setFloating: (node: HTMLElement | null) => void;
	};
	context: Record<string, unknown>;
};

export type FloatingUiArrowProps = React.SVGProps<SVGSVGElement> & {
	context: unknown;
	width?: number;
	height?: number;
	tipRadius?: number;
	staticOffset?: string | number | null;
	d?: string;
};
