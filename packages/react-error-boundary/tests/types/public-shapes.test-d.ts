import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
import * as EB from '@octanejs/react-error-boundary';
// @parity-case types:error-boundary-pristine:public-contract
// @parity-case types:error-boundary-adapted:public-contract

type BoundaryProps = Assert<
	Equal<Parameters<typeof EB.ErrorBoundary>[0]['resetKeys'], unknown[] | undefined>
>;
type BoundaryHandle = Assert<
	Equal<EB.ErrorBoundary['resetErrorBoundary'], (...args: unknown[]) => void>
>;
type Context = Assert<
	Equal<
		NonNullable<Parameters<typeof EB.ErrorBoundaryContext.Provider>[0]['value']>['didCatch'],
		boolean
	>
>;
type ContextValue = Assert<Equal<EB.ErrorBoundaryContextType['didCatch'], boolean>>;
type Props = Assert<Equal<EB.ErrorBoundaryProps['resetKeys'], unknown[] | undefined>>;
type ComponentProps = Assert<
	Equal<
		Parameters<NonNullable<EB.ErrorBoundaryPropsWithComponent['onReset']>>[0]['reason'],
		'keys' | 'imperative-api'
	>
>;
type RenderProps = Assert<
	Equal<
		Parameters<EB.ErrorBoundaryPropsWithRender['fallbackRender']>[0]['resetErrorBoundary'],
		(...args: unknown[]) => void
	>
>;
type StaticProps = Assert<Equal<EB.ErrorBoundaryPropsWithFallback['fallbackRender'], undefined>>;
type Fallback = Assert<Equal<EB.FallbackProps['resetErrorBoundary'], (...args: unknown[]) => void>>;
type ErrorCallback = Assert<Equal<ReturnType<EB.OnErrorCallback>, void>>;
type Hook = Assert<Equal<ReturnType<typeof EB.useErrorBoundary>['resetBoundary'], () => void>>;
type HookApi = Assert<Equal<EB.UseErrorBoundaryApi['showBoundary'], (error: unknown) => void>>;
type Message = Assert<Equal<ReturnType<typeof EB.getErrorMessage>, string | undefined>>;
const View = (props: { label: string }) => null;
const Wrapped = EB.withErrorBoundary(View, { fallback: null });
type Wrapper = Assert<Equal<Parameters<typeof Wrapped>[0]['label'], string>>;
// @ts-expect-error The fallback alternatives are mutually exclusive.
const invalid: EB.ErrorBoundaryProps = { fallback: null, fallbackRender: () => null };
// @ts-expect-error Error text may be absent.
const requiredMessage: string = EB.getErrorMessage(null);
// @ts-expect-error A wrapped component retains its required props.
const missing: Parameters<typeof Wrapped>[0] = {};
void [invalid, requiredMessage, missing];

type ComponentAlias = Assert<
	Equal<Parameters<EB.ComponentType<{ label: string }>>[0]['label'], string>
>;

import * as Server from '@octanejs/react-error-boundary/server';
type ServerBoundaryProps = Assert<
	Equal<Parameters<typeof Server.ErrorBoundary>[0]['resetKeys'], unknown[] | undefined>
>;
type ServerBoundaryHandle = Assert<
	Equal<Server.ErrorBoundary['resetErrorBoundary'], (...args: unknown[]) => void>
>;
type ServerContext = Assert<
	Equal<
		NonNullable<Parameters<typeof Server.ErrorBoundaryContext.Provider>[0]['value']>['didCatch'],
		boolean
	>
>;
type ServerContextValue = Assert<Equal<Server.ErrorBoundaryContextType['didCatch'], boolean>>;
type ServerProps = Assert<Equal<Server.ErrorBoundaryProps['resetKeys'], unknown[] | undefined>>;
type ServerComponentProps = Assert<
	Equal<
		Parameters<NonNullable<Server.ErrorBoundaryPropsWithComponent['onReset']>>[0]['reason'],
		'keys' | 'imperative-api'
	>
>;
type ServerRenderProps = Assert<
	Equal<
		Parameters<Server.ErrorBoundaryPropsWithRender['fallbackRender']>[0]['resetErrorBoundary'],
		(...args: unknown[]) => void
	>
>;
type ServerStaticProps = Assert<
	Equal<Server.ErrorBoundaryPropsWithFallback['fallbackRender'], undefined>
>;
type ServerFallback = Assert<
	Equal<Server.FallbackProps['resetErrorBoundary'], (...args: unknown[]) => void>
>;
type ServerErrorCallback = Assert<Equal<ReturnType<Server.OnErrorCallback>, void>>;
type ServerHook = Assert<
	Equal<ReturnType<typeof Server.useErrorBoundary>['resetBoundary'], () => void>
>;
type ServerHookApi = Assert<
	Equal<Server.UseErrorBoundaryApi['showBoundary'], (error: unknown) => void>
>;
type ServerMessage = Assert<Equal<ReturnType<typeof Server.getErrorMessage>, string | undefined>>;
const ServerView = (props: { label: string }) => null;
const ServerWrapped = Server.withErrorBoundary(ServerView, { fallback: null });
type ServerWrapper = Assert<Equal<Parameters<typeof ServerWrapped>[0]['label'], string>>;
// @ts-expect-error The fallback alternatives are mutually exclusive.
const Serverinvalid: Server.ErrorBoundaryProps = { fallback: null, fallbackRender: () => null };
// @ts-expect-error Error text may be absent.
const ServerrequiredMessage: string = Server.getErrorMessage(null);
// @ts-expect-error A wrapped component retains its required props.
const Servermissing: Parameters<typeof ServerWrapped>[0] = {};
void [Serverinvalid, ServerrequiredMessage, Servermissing];

type ServerComponentAlias = Assert<
	Equal<Parameters<Server.ComponentType<{ label: string }>>[0]['label'], string>
>;

type WrapperOptions = Assert<
	Equal<Parameters<typeof EB.withErrorBoundary>[1]['resetKeys'], unknown[] | undefined>
>;
type ServerWrapperOptions = Assert<
	Equal<Parameters<typeof Server.withErrorBoundary>[1]['resetKeys'], unknown[] | undefined>
>;
