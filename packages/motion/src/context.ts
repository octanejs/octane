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
