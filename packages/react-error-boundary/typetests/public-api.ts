import {
	getErrorMessage,
	withErrorBoundary,
	type ComponentType,
	type ErrorBoundaryPropsWithComponent,
	type ErrorBoundaryPropsWithFallback,
	type ErrorBoundaryPropsWithRender,
	type OnErrorCallback,
	type UseErrorBoundaryApi,
} from '@octanejs/react-error-boundary';
import type {
	ErrorBoundaryPropsWithComponent as ServerPropsWithComponent,
	ErrorBoundaryPropsWithFallback as ServerPropsWithFallback,
	ErrorBoundaryPropsWithRender as ServerPropsWithRender,
} from '@octanejs/react-error-boundary/server';

declare const View: ComponentType<{ label: string; count?: number }>;
const Wrapped = withErrorBoundary(View, { fallback: null });

Wrapped({ label: 'ok' }, null as never, undefined);
// @ts-expect-error label remains required
Wrapped({}, null as never, undefined);

const onError: OnErrorCallback = (error: unknown, info) => {
	getErrorMessage(error);
	info.componentStack;
};
declare const api: UseErrorBoundaryApi;
api.showBoundary({ cause: 'unknown values are supported' });
api.error;
void onError;

declare const fallbackProps: ErrorBoundaryPropsWithFallback;
declare const componentProps: ErrorBoundaryPropsWithComponent;
declare const renderProps: ErrorBoundaryPropsWithRender;
const serverFallbackProps: ServerPropsWithFallback = fallbackProps;
const serverComponentProps: ServerPropsWithComponent = componentProps;
const serverRenderProps: ServerPropsWithRender = renderProps;
void [serverFallbackProps, serverComponentProps, serverRenderProps];
