import type { SignalHandle } from './types.js';

/** Renderer-independent capability shared by early views and later presentation. */
export const BINDING_HANDOFF = /* @__PURE__ */ Symbol.for('octane.binding-handoff');

/** Explicit, renderer-independent ownership of one standalone native control. */
export const CONTROL_HANDOFF = /* @__PURE__ */ Symbol.for('octane.control-handoff');

/** @internal One claim registry for writable and readonly native control leases. */
export const CONTROL_BINDINGS = /* @__PURE__ */ new WeakMap<Element, Set<'value' | 'checked'>>();

/** @internal Readonly projections also own the property, even without an input writer. */
export function hasSignalControlBinding(control: Element, channel: 'value' | 'checked'): boolean {
	return CONTROL_BINDINGS.get(control)?.has(channel) ?? false;
}

/** @internal A root may consume this capability only with its accepted presentation. */
export interface ControlHandoff {
	readonly control: Element;
	readonly channel: 'value' | 'checked';
	active(): boolean;
	/** Called within the prospective renderer's signal owner, without changing authority. */
	matches(handle: SignalHandle<unknown>): boolean;
	composing(): boolean;
	retire(): void;
	owner?: object;
}

/** Callable cleanup which can also be offered explicitly to hydrateRoot's controlLeases. */
export interface SignalControlBinding {
	(): void;
	/** @internal Merely requesting the capability never transfers the control. */
	[CONTROL_HANDOFF](): ControlHandoff;
}
