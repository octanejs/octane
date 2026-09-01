# @octanejs/react-error-boundary

Octane adapter for the public `react-error-boundary@6.1.2` API. It uses
Octane's native `@try`/`@catch` boundary rather than shipping another error
catching engine.

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
`withErrorBoundary` are supported.
Errors from event handlers and async callbacks are not render errors; forward
them with `useErrorBoundary().showBoundary(error)`.

For server rendering, import `ErrorBoundary` from
`@octanejs/react-error-boundary/server`. That entry deliberately does not catch
descendant errors, matching upstream React server behavior.
