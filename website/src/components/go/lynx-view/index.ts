// Framework-neutral `<lynx-view>` embedding, adapted from @lynx-js/go-web.
// See ./UPSTREAM.md — this surface is shaped to go back upstream.
export { mountLynxView } from './controller.ts';
export { playAutoGesture } from './auto-gesture.ts';
export type {
	AutoGestureHandle,
	AutoGestureOptions,
	GesturePoint,
	GestureStep,
} from './auto-gesture.ts';
export type {
	LynxViewHandle,
	LynxViewOptions,
	LynxViewStage,
	LynxViewState,
} from './controller.ts';
export type { ResolvedWebPreviewFitKind, ResolvedWebPreviewMode, WebPreviewMode } from './mode.ts';
