import type {
	Instance,
	Modifier as PopperModifier,
	Options,
	Placement,
	PositioningStrategy,
	State,
	StrictModifiers,
	VirtualElement,
} from '@popperjs/core';
import type { OctaneNode } from 'octane';
import type { CSSProperties } from 'react';

export type RefObject<T> = { current: T | null };
export type RefCallback<T> = (value: T | null) => void;
export type Ref<T> = RefCallback<T> | RefObject<T> | null | undefined;
export type RefHandler = (ref: HTMLElement | null) => void;
export type Style = CSSProperties;

// OCTANE DIVERGENCE[popper-octane-node-and-ref-types][types:popper-adapted-main]
// OCTANE DIVERGENCE[popper-octane-node-and-ref-types][types:popper-adapted-svg]
export interface ManagerProps {
	children: OctaneNode;
}

export interface ReferenceChildrenProps {
	ref: Ref<any>;
}

export interface ReferenceProps {
	children: (props: ReferenceChildrenProps) => OctaneNode;
	innerRef?: Ref<any>;
}

export interface PopperArrowProps {
	ref: Ref<any>;
	style: Style;
}

export interface PopperChildrenProps {
	ref: Ref<any>;
	style: Style;
	placement: Placement;
	isReferenceHidden?: boolean;
	hasPopperEscaped?: boolean;
	update: () => Promise<null | Partial<State>>;
	forceUpdate: () => Partial<State>;
	arrowProps: PopperArrowProps;
}

type UnionWhere<U, M> = U extends M ? U : never;
type StrictModifierNames = NonNullable<StrictModifiers['name']>;

export type StrictModifier<Name extends StrictModifierNames = StrictModifierNames> = UnionWhere<
	StrictModifiers,
	{ name?: Name }
>;

export type Modifier<
	Name,
	ModifierOptions extends object = object,
> = Name extends StrictModifierNames
	? StrictModifier<Name>
	: Partial<PopperModifier<Name, ModifierOptions>>;

export interface PopperProps<Modifiers = string> {
	children: (props: PopperChildrenProps) => OctaneNode;
	innerRef?: Ref<any>;
	modifiers?: ReadonlyArray<Modifier<Modifiers>>;
	placement?: Placement;
	strategy?: PositioningStrategy;
	referenceElement?: HTMLElement | VirtualElement;
	onFirstUpdate?: (state: Partial<State>) => void;
}

export type UsePopperOptions<Modifiers = string> = Omit<Partial<Options>, 'modifiers'> & {
	createPopper?: typeof import('@popperjs/core').createPopper;
	modifiers?: ReadonlyArray<Modifier<Modifiers>>;
};

export interface UsePopperResult {
	styles: Record<string, Style>;
	attributes: Record<string, Record<string, string> | undefined>;
	state: State | null;
	update: Instance['update'] | null;
	forceUpdate: Instance['forceUpdate'] | null;
}
