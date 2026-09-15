import { getErrorMessage, withErrorBoundary } from '@octanejs/react-error-boundary';
import type * as EB from '@octanejs/react-error-boundary';
import type * as Server from '@octanejs/react-error-boundary/server';
declare const View: EB.ComponentType<{ label: string; count?: number }>;
const Wrapped = withErrorBoundary(View, { fallback: null });

Wrapped({ label: 'ok' }, null as never, undefined);
// @ts-expect-error label remains required
Wrapped({}, null as never, undefined);

const onError: EB.OnErrorCallback = (error: unknown, info) => {
	getErrorMessage(error);
	info.componentStack;
};
declare const api: EB.UseErrorBoundaryApi;
api.showBoundary({ cause: 'unknown values are supported' });
api.error;
void onError;

declare const fallbackProps: EB.ErrorBoundaryPropsWithFallback;
declare const componentProps: EB.ErrorBoundaryPropsWithComponent;
declare const renderProps: EB.ErrorBoundaryPropsWithRender;
const serverFallbackProps: Server.ErrorBoundaryPropsWithFallback = fallbackProps;
const serverComponentProps: Server.ErrorBoundaryPropsWithComponent = componentProps;
const serverRenderProps: Server.ErrorBoundaryPropsWithRender = renderProps;
void [serverFallbackProps, serverComponentProps, serverRenderProps];
