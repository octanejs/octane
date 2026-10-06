/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

// The evaluator accepts compiler-injected imports without exposing the full
// private runtime to submissions. Keep its existing public surface and add only
// the helpers the client compiler routes to `octane/internal/client` when Vitest
// compiles a submission or an allowed binding package. That compile is Vite's
// dev/HMR mode, which never emits the production-only hook-memo or compiled-
// context helpers, and native signal reads need an `octane/signals` import that
// submissions cannot make.
export * from '../../octane/src/index.js';
export {
	enableSignalBindings,
	createElementAt,
	createElementFromConfig,
	createHostElement,
	enableDescriptorFormActions,
	enableDescriptorFragmentRefs,
	isRenderCall,
	deferRecord,
	bindSignalText,
	bindSignalChild,
	bindSignalAttribute,
	bindSignalValue,
	bindSignalChecked,
	bindSignalHostPropSources,
	setPlainAttribute,
	setPlainAttributeIfChanged,
	setURLAttribute,
	setURLAttributeIfChanged,
	setAttributeIfChanged,
	setStringDataIfChanged,
	setBooleanAttributeIfChanged,
	setAriaAttributeIfChanged,
	setClassNameIfChanged,
	setClassAttrIfChanged,
	updateFreshClassName,
	updateFreshClassAttr,
	textHoleUpdate,
	childTextHoleUpdate,
	canSplitStyleProperties,
	styleObjectPrototype,
	isContext,
	// `'use dom bindings'` views.
	bindPresentationView,
	beginPresentationHydration,
	endPresentationHydration,
	presentationWrite,
	presentationHostWrite,
	presentationStructure,
	presentationFailure,
	markBindingChildren,
	bindingText,
	bindingChildSlot,
	setBindingClass,
	setBindingClassIfChanged,
	hydrateClaimedBindingCaches,
} from '../../octane/src/internal/client.js';
