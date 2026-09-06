// Stand-in for published Octane 0.2.3: the same public names testing-library
// imports, except `isInActScope`, which that release does not export.
export {
	act,
	createElement,
	createRoot,
	drainPassiveEffects,
	flushSync,
	hasPendingWork,
	hydrateRoot,
	isValidElement,
	useEffect,
	withSlot,
	type ComponentBody,
	type ElementDescriptor,
	type OctaneNode,
	type Root,
} from '../../../octane/src/index.ts';
