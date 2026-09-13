# @octanejs/react-error-boundary

Octane adapter for the public `react-error-boundary@6.1.5` API. It uses
Octane's native error boundary for catching and preserves the compatibility APIs.

## Installation

```sh
npm install @octanejs/react-error-boundary
pnpm add @octanejs/react-error-boundary
```

```tsrx
import { ErrorBoundary } from '@octanejs/react-error-boundary';
import { getErrorMessage } from '@octanejs/react-error-boundary';

function App() @{
  <ErrorBoundary
    fallbackRender={({ error, resetErrorBoundary }) =>
      <button onClick={() => resetErrorBoundary()}>
        {'Retry after ' + (getErrorMessage(error) ?? 'unknown error')}
      </button>}
  >
    <Screen />
  </ErrorBoundary>
}
```

`fallback`, `FallbackComponent`, `fallbackRender`, `onError`, `onReset`,
`resetKeys`, `ErrorBoundaryContext`, `getErrorMessage`, `useErrorBoundary`, and
`withErrorBoundary`, and `ref.current.resetErrorBoundary(...args)` are supported.
Errors from event handlers and async callbacks are not render errors; forward
them with `useErrorBoundary().showBoundary(error)`.

For server rendering, import `ErrorBoundary` from
`@octanejs/react-error-boundary/server`. That entry propagates descendant errors, matching upstream React server behavior,
and retains the client boundary structure for hydration.
