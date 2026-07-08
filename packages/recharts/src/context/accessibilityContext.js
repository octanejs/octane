// Vendored verbatim from recharts@3.9.2 es6/context/accessibilityContext.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
import { useAppSelector } from '../state/hooks';
export var useAccessibilityLayer = () => {
	var _useAppSelector;
	return (_useAppSelector = useAppSelector((state) => state.rootProps.accessibilityLayer)) !==
		null && _useAppSelector !== void 0
		? _useAppSelector
		: true;
};
