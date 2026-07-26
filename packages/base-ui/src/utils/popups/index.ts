// Mirrors .base-ui/packages/react/src/utils/popups/index.ts — the popup store engine barrel.
export * from './store';
export * from './popupStoreUtils';
export * from './popupTriggerMap';
export {
	createInlineMiddleware,
	getInlineRectTriggerProps,
	updateInlineRectCoords,
	type InlineRectCoords,
} from './inlineRect';
