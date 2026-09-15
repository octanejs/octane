import type { Assert, Equal } from '../../../scripts/react-port/type-assertions';
import * as EB from 'react-error-boundary';
// @parity-case types:error-boundary-pristine:public-contract
// @parity-case types:error-boundary-adapted:public-contract

type BoundaryProps = Assert<
	Equal<ConstructorParameters<typeof EB.ErrorBoundary>[0]['resetKeys'], unknown[] | undefined>
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

type WrapperOptions = Assert<
	Equal<Parameters<typeof EB.withErrorBoundary>[1]['resetKeys'], unknown[] | undefined>
>;
