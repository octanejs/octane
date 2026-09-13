/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

// The evaluator accepts compiler-injected imports without exposing the full
// private runtime to submissions. Keep its existing public surface and add only
// the compact binding operations emitted by the component compiler.
export * from '../../octane/src/index.js';
export {
	enableSignalBindings,
	createElementAt,
	bindSignalText,
	bindSignalChild,
	bindSignalAttribute,
	bindSignalStyleProperty,
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
} from '../../octane/src/internal/client.js';
