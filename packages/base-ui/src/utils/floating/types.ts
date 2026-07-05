// Ported from .base-ui/packages/react/src/floating-ui-react/types.ts (v1.6.0) — the subset the
// Base UI overlays use. `FloatingRootContext` IS the store (`FloatingRootStore`); a `FloatingContext`
// wraps it with the positioning data. Interaction hooks return `ElementProps` prop bags.
import type { FloatingRootStore } from './FloatingRootStore';
import type { FloatingTreeStore } from './FloatingTreeStore';

export type FloatingTreeType = FloatingTreeStore;

export interface VirtualElement {
	getBoundingClientRect(): DOMRect;
	contextElement?: Element;
}

export type ReferenceType = Element | VirtualElement;

export interface FloatingEvents {
	emit(event: string, data?: any): void;
	on(event: string, listener: (data: any) => void): void;
	off(event: string, listener: (data: any) => void): void;
}

export interface ContextData {
	openEvent?: Event;
	[key: string]: any;
}

export type FloatingRootContext = FloatingRootStore;

export interface FloatingContext {
	rootStore: FloatingRootContext;
	open: boolean;
	onOpenChange: (open: boolean, eventDetails: any) => void;
	nodeId: string | undefined;
	dataRef: { current: ContextData };
	events: FloatingEvents;
	elements: {
		reference: ReferenceType | null;
		floating: HTMLElement | null;
		domReference: Element | null;
	};
	refs: { setPositionReference(node: ReferenceType | null): void };
	[key: string]: any;
}

export interface FloatingNodeType {
	id: string | undefined;
	parentId: string | null;
	context?: FloatingContext | undefined;
}

export interface ElementProps {
	reference?: Record<string, any>;
	floating?: Record<string, any>;
	item?: Record<string, any> | ((props: any) => Record<string, any>);
	// Base UI's store-connected interaction hooks also expose the trigger prop bag.
	trigger?: Record<string, any>;
}
