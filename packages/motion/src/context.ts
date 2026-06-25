// Contexts shared across motion components.
import { createContext, useContext } from 'octane-ts';

// MotionConfig — global defaults (transition, reduced motion) inherited by every
// motion element below a `<MotionConfig>`.
export interface MotionConfigValue {
	transition?: any;
	reducedMotion?: 'always' | 'never' | 'user';
}
export const MotionConfigContext = createContext<MotionConfigValue>({});

// Variant labels propagated from a parent motion element to its descendants, so a
// child with `variants` but no explicit `animate` inherits the parent's active
// label (Framer Motion's variant propagation).
export interface VariantLabels {
	initial?: string;
	animate?: string;
}
export const VariantContext = createContext<VariantLabels>({});

// Stagger orchestration: a motion element with `staggerChildren`/`delayChildren` in
// its (variant) transition provides this to its variant-inheriting children, who each
// register to get a stable index and derive a per-child animation delay from it.
export interface StaggerOrchestration {
	active: boolean;
	staggerChildren: number;
	// A number base delay, or Framer's `stagger()` / `(index, total) => delay` function.
	delayChildren: number | ((index: number, total: number) => number);
	staggerDirection: number;
	// Ordered child tokens (registered in render/DOM order); index + length drive delay.
	children: any[];
}
export const StaggerContext = createContext<StaggerOrchestration | null>(null);

export function useMotionConfig(): MotionConfigValue {
	return useContext(MotionConfigContext);
}

export function useInheritedVariants(): VariantLabels {
	return useContext(VariantContext);
}

// Resolve a target that may be a variant label (string) against a `variants` map,
// or pass an inline target object straight through.
export function resolveVariant(value: any, variants: any): any {
	if (typeof value === 'string') return variants ? variants[value] : undefined;
	return value;
}

// Split a variant target into its animatable values and its `transition` (Framer
// puts orchestration + per-variant transition options under a `transition` key on the
// target object; the engine's `animate(el, values, options)` wants them separated).
export function splitVariant(v: any): { values: any; transition: any } {
	if (v && typeof v === 'object' && !Array.isArray(v) && 'transition' in v) {
		const { transition, ...values } = v;
		return { values, transition };
	}
	return { values: v, transition: undefined };
}
