import type { OctaneNode } from 'octane';
import type { Octane, OctaneElement } from 'octane/jsx-runtime';

type HTMLElementAttributes = Octane.HTMLAttributes<HTMLElement>;
type AriaAttributeName = Extract<keyof HTMLElementAttributes, `aria-${string}`>;

export type ViewportComponentAttributes = Pick<
	HTMLElementAttributes,
	'className' | 'id' | 'role' | 'tabIndex' | 'onKeyDown' | 'onWheel' | AriaAttributeName
> & { style?: CSSProperties };

export type CSSProperties = Exclude<
	Octane.JSX.IntrinsicElements['div']['style'],
	string | undefined
>;

/** @internal */
export type ImperativeRef<T> = { current: T | null } | ((value: T | null) => void) | null;

export interface CustomContainerComponentProps {
	style: CSSProperties;
	children: OctaneNode;
	ref?: ImperativeRef<HTMLDivElement>;
}

export type CustomContainerComponent = (props: CustomContainerComponentProps) => OctaneElement;

/**
 * Props of customized item component for {@link Virtualizer} or {@link WindowVirtualizer}.
 */
export interface CustomItemComponentProps {
	style: CSSProperties;
	index: number;
	children: OctaneNode;
	ref?: ImperativeRef<HTMLDivElement>;
}

export type CustomItemComponent = (props: CustomItemComponentProps) => OctaneElement;
