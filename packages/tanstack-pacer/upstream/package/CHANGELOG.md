# @tanstack/react-pacer

## 0.22.1

### Patch Changes

- Allow standalone devtools panels to render without required TanStack Devtools props. ([#216](https://github.com/TanStack/pacer/pull/216))

- Updated dependencies [[`47d02e2`](https://github.com/TanStack/pacer/commit/47d02e20e8470abacc86a8a06926ec7bc1c81a7a)]:
  - @tanstack/pacer@0.21.1

## 0.22.0

### Minor Changes

- feat: upgrade to tanstack store with useSelector hook ([`c9f6385`](https://github.com/TanStack/pacer/commit/c9f63850f816bfc95eca74699b0fff45bca02867))

### Patch Changes

- Updated dependencies [[`c9f6385`](https://github.com/TanStack/pacer/commit/c9f63850f816bfc95eca74699b0fff45bca02867)]:
  - @tanstack/pacer@0.21.0

## 0.21.1

### Patch Changes

- chore: bump tanstack store versions for better tree-shaking ([`4e74cb4`](https://github.com/TanStack/pacer/commit/4e74cb42bf803bbc11932285d4508964c45f3283))

- Updated dependencies [[`4e74cb4`](https://github.com/TanStack/pacer/commit/4e74cb42bf803bbc11932285d4508964c45f3283)]:
  - @tanstack/pacer@0.20.1

## 0.21.0

### Minor Changes

- feat: TanStack Store Upgrade to alien signals ([#178](https://github.com/TanStack/pacer/pull/178))

### Patch Changes

- Updated dependencies [[`225381e`](https://github.com/TanStack/pacer/commit/225381e40d848b0bf35a690bb9d5009255fb4c9d)]:
  - @tanstack/pacer@0.20.0

## 0.20.0

### Minor Changes

- feat: Add optional `onUnmount` callback to Debouncer, Throttler, Batcher, Queuer and async variants for custom cleanup. ([#158](https://github.com/TanStack/pacer/pull/158))

### Patch Changes

- Updated dependencies [[`54d2c21`](https://github.com/TanStack/pacer/commit/54d2c21ca241d9d92ef3c2322bbd12fa905f6e4c)]:
  - @tanstack/pacer@0.19.0

## 0.19.4

### Patch Changes

- Updated dependencies [[`66fffde`](https://github.com/TanStack/pacer/commit/66fffdeedfd7254c4ad193c3e3b7053b5c35a276)]:
  - @tanstack/pacer@0.18.0

## 0.19.3

### Patch Changes

- Updated dependencies [[`2bb7e70`](https://github.com/TanStack/pacer/commit/2bb7e7096715fbaf4584fe392810dc0fec72f844)]:
  - @tanstack/pacer@0.17.3

## 0.19.2

### Patch Changes

- Fixed getAbortSignal binding on all utils ([#132](https://github.com/TanStack/pacer/pull/132))
  Fixed lastResult overwrite bug in AsyncQueuer
  Updated TanStack Devtools versions
- Updated dependencies [[`98e606f`](https://github.com/TanStack/pacer/commit/98e606f0b628c1c52b8bf794e9a6fd1ac2d56b73)]:
  - @tanstack/pacer@0.17.2

## 0.19.1

### Patch Changes

- devtools and event-client version bumps ([`17b9704`](https://github.com/TanStack/pacer/commit/17b9704d8b04890665975c09587f035911a2a5cc))

- Updated dependencies [[`17b9704`](https://github.com/TanStack/pacer/commit/17b9704d8b04890665975c09587f035911a2a5cc)]:
  - @tanstack/pacer@0.17.1

## 0.19.0

### Minor Changes

- add Subscribe API to all util hooks ([#121](https://github.com/TanStack/pacer/pull/121))

## 0.18.0

### Minor Changes

- feat: add preact adapter\ ([#112](https://github.com/TanStack/pacer/pull/112))

### Patch Changes

- Updated dependencies [[`2906cd3`](https://github.com/TanStack/pacer/commit/2906cd3ca1a4bc54460cf8558dbff2d8f4089f6c)]:
  - @tanstack/pacer@0.17.0

## 0.17.4

### Patch Changes

- build: migrate to tsdown ([#113](https://github.com/TanStack/pacer/pull/113))

- Updated dependencies [[`adc3193`](https://github.com/TanStack/pacer/commit/adc3193e2a8d15de29b89444f775e8e1b0302e3e)]:
  - @tanstack/pacer@0.16.4

## 0.17.3

### Patch Changes

- Updated dependencies [[`9893832`](https://github.com/TanStack/pacer/commit/98938323f0bc1a6ab87bce72287c6d4a7264cb93)]:
  - @tanstack/pacer@0.16.3

## 0.17.2

### Patch Changes

- Updated dependencies [[`f841198`](https://github.com/TanStack/pacer/commit/f8411985a742eb556b26b2f00fad4058df3e2d07)]:
  - @tanstack/pacer@0.16.2

## 0.17.1

### Patch Changes

- Updated dependencies [[`64db505`](https://github.com/TanStack/pacer/commit/64db5057c65837836fed053708e7465987fbcb11)]:
  - @tanstack/pacer@0.16.1

## 0.17.0

### Minor Changes

- feat: Added `PacerProvider` component and related hooks (`usePacerContext`, `useDefaultPacerOptions`) for React applications to set default configurations for all pacer utilities within a component tree ([#54](https://github.com/TanStack/pacer/pull/54))

- - feat:Added `AsyncRetryer` class and `asyncRetry` function with exponential/linear/fixed backoff strategies, jitter support, timeout controls (`maxExecutionTime`, `maxTotalExecutionTime`), lifecycle callbacks (`onRetry`, `onSuccess`, `onError`, `onLastError`, `onSettled`, `onAbort`, `onExecutionTimeout`, `onTotalExecutionTimeout`), dynamic options, and built-in retry integration via `asyncRetryerOptions` for all async utilities (`AsyncBatcher`, `AsyncDebouncer`, `AsyncQueuer`, `AsyncRateLimiter`, `AsyncThrottler`) ([#54](https://github.com/TanStack/pacer/pull/54))
  - feat: Added `getAbortSignal()` method to all async utilities (`AsyncRetryer`, `AsyncBatcher`, `AsyncDebouncer`, `AsyncQueuer`, `AsyncRateLimiter`, `AsyncThrottler`) to enable true cancellation of underlying async operations (like fetch requests) when `abort()` is called
  - feat: Added `asyncBatcherOptions`, `asyncDebouncerOptions`, `asyncQueuerOptions`, `asyncRateLimiterOptions`, `asyncRetryerOptions`, `asyncThrottlerOptions`, `debouncerOptions`, `queuerOptions`, `rateLimiterOptions`, `throttlerOptions` utility functions for sharing common options between different pacer utilities
  - fix: Fixed async-throtter trailing edge behavior when long executions were awaited.
  - breaking: standardized `reset`, `cancel` and `abort` API behaviors with consistent naming and behavior across all async utilities. Canceling no longer aborts, new dedicated `abort` method is provided for aborting ongoing executions.

### Patch Changes

- Updated dependencies [[`3124ea3`](https://github.com/TanStack/pacer/commit/3124ea34cab13dd69f286a6836c585aaf6f083c4)]:
  - @tanstack/pacer@0.16.0

## 0.16.4

### Patch Changes

- Updated dependencies [[`129de42`](https://github.com/TanStack/pacer/commit/129de427cb34bcf81d4f1a3c8e26637004aff6b0)]:
  - @tanstack/pacer@0.15.4

## 0.16.3

### Patch Changes

- Updated dependencies [[`8f5d2cb`](https://github.com/TanStack/pacer/commit/8f5d2cb68f0e05c952c1fa8272382d58a6914e28)]:
  - @tanstack/pacer@0.15.3

## 0.16.2

### Patch Changes

- Updated dependencies [[`1a241bf`](https://github.com/TanStack/pacer/commit/1a241bfa25e68044d38f8ae13456dd68d9caff14)]:
  - @tanstack/pacer@0.15.2

## 0.16.1

### Patch Changes

- Updated dependencies [[`9e06f57`](https://github.com/TanStack/pacer/commit/9e06f571ae24342129b1f692d390e6500a675aef)]:
  - @tanstack/pacer@0.15.1

## 0.16.0

### Minor Changes

- feat: added pacer devtools ([`3206b5f`](https://github.com/TanStack/pacer/commit/3206b5f8167d13bc1c642c53574bb65ea126d24b))

### Patch Changes

- Updated dependencies [[`3206b5f`](https://github.com/TanStack/pacer/commit/3206b5f8167d13bc1c642c53574bb65ea126d24b)]:
  - @tanstack/pacer@0.15.0

## 0.15.0

### Minor Changes

- fix: sync passed function for all utils on every render instead of only on mount to fix closure issues ([`98ae22c`](https://github.com/TanStack/pacer/commit/98ae22c5836aca9ff6a404770d7f210e686e098c))

### Patch Changes

- Updated dependencies [[`98ae22c`](https://github.com/TanStack/pacer/commit/98ae22c5836aca9ff6a404770d7f210e686e098c)]:
  - @tanstack/pacer@0.14.0

## 0.14.0

### Minor Changes

- breaking: added items/batch/args as params to onSuccess, onSettled, and onExecute callbacks ([`e92923b`](https://github.com/TanStack/pacer/commit/e92923b764c6eb42b76bd5edaaac446c4f6a13f9))

### Patch Changes

- Updated dependencies [[`e92923b`](https://github.com/TanStack/pacer/commit/e92923b764c6eb42b76bd5edaaac446c4f6a13f9)]:
  - @tanstack/pacer@0.13.0

## 0.13.0

### Minor Changes

- Add `useAsyncBatchedCallback` and `useBatchedCallback`, hooks for batching and debouncing async operations in React ([`10fc5e9`](https://github.com/TanStack/pacer/commit/10fc5e917b55f7be6825af50bb5ecd3ca9c678f7))

## 0.12.0

### Minor Changes

- breaking: changed callback signature of `onError` in AsyncDebouncer, AsyncThrottler, AsyncQueuer, AsyncRatelimiter, and AsyncBatcher to include the item that caused the error ([#45](https://github.com/TanStack/pacer/pull/45))
  fix: Fixed Error Handling in Async Debouncer and Throttler by properly resolving and rejecting returned promises from `maybeExecute`

### Patch Changes

- Updated dependencies [[`0303238`](https://github.com/TanStack/pacer/commit/030323846f34af4683335383d796144f39308106)]:
  - @tanstack/pacer@0.12.0

## 0.11.0

### Minor Changes

- breaking: selectors are required in react and solid adapters in order to read state changes with reactivity ([#43](https://github.com/TanStack/pacer/pull/43))

### Patch Changes

- Updated dependencies [[`7969682`](https://github.com/TanStack/pacer/commit/7969682be3bf8745822baf646d74e17ddb64afac)]:
  - @tanstack/pacer@0.11.0

## 0.10.0

### Minor Changes

- breaking: Removed `isRunning` state from `Batcher` and `AsyncBatcher` utils, and also removed `start` and `stop` methods ([#40](https://github.com/TanStack/pacer/pull/40))
  breaking: Changed `flush()` method in `AsyncDebouncer`, `AsyncThrottler`, and `AsyncQueuer` to return Promises instead of void
  feat: Added `flushAsBatch` methods to the `Queuer` and `AsyncQueuer` utils
  feat: Added `isExceeded` and `status` state properties to `RateLimiter` and `AsyncRateLimiter` for better rate limit tracking
  feat: Enhanced error handling in `AsyncDebouncer` and `AsyncThrottler` with proper promise rejection support
  feat: Improved timeout management in rate limiters with automatic cleanup of expired execution times

### Patch Changes

- Updated dependencies [[`d229d42`](https://github.com/TanStack/pacer/commit/d229d42e95d9da3e8a7f301ce47cf738a9a01f1f)]:
  - @tanstack/pacer@0.10.0

## 0.9.1

### Patch Changes

- Updated dependencies [[`6b435f5`](https://github.com/TanStack/pacer/commit/6b435f53a628e4103b9a9589b61240896b85cf55)]:
  - @tanstack/pacer@0.9.1

## 0.9.0

### Minor Changes

- - breaking: Removed most "get" methods that can now be read directly from the state (e.g. `debouncer.getExecutionCount()` -> `debouncer.store.state.executionCount` or `debouncer.state.executionCount` in framework adapters) ([#32](https://github.com/TanStack/pacer/pull/32))
  - breaking: Removed `getOptions` and other option resolver methods such as `getEnabled` and `getWait`
  - feat: Rewrote TanStack Pacer to use TanStack Store for state management
  - feat: Added `flush` methods to all utils to trigger pending executions to execute immediately.
  - feat: Added an `initialState` option to all utils to set the initial state for persistence features
  - feat: Added status state to all utils except rate-limiters for pending, excution, etc. states.
  - feat: Added new AsyncBatcher utility
  - fix: Multiple bug fixes

### Patch Changes

- Updated dependencies [[`9e7bcb1`](https://github.com/TanStack/pacer/commit/9e7bcb1edf5e53314a6b808b6b9b22ea48df84ff)]:
  - @tanstack/pacer@0.9.0

## 0.8.0

### Minor Changes

- breaking: Renamed `get*Item` instance methods to `peek*Item` instance methods to indicate that they do not pop or process items ([`1599c97`](https://github.com/TanStack/pacer/commit/1599c9785f7496648a2b44274b839c7f784ce7f5))

### Patch Changes

- Updated dependencies [[`1599c97`](https://github.com/TanStack/pacer/commit/1599c9785f7496648a2b44274b839c7f784ce7f5)]:
  - @tanstack/pacer@0.8.0

## 0.7.0

### Minor Changes

- feat: New `Batcher` Utility to batch process items ([#25](https://github.com/TanStack/pacer/pull/25))
  fix: Fixed `AsyncDebouncer` and `AsyncThrottler` to resolve previous promises on new executions
  breaking: `Queuer` and `AsyncQueuer` have new required `fn` parameter before the `options` parameter to match other utilities and removed `onGetNextItem` option
  breaking: `Queuer` and `AsyncQueuer` now use `execute` method instead instead of `getNextItem`, but both methods are now public
  breaking: For the `AsyncQueuer`, you now add items instead of functions to the AsyncQueuer. The `fn` parameter is now the function to execute for each item.

### Patch Changes

- Updated dependencies [[`9c03795`](https://github.com/TanStack/pacer/commit/9c037959e90a67ebe3a848fd711bbbd8f3c283cb)]:
  - @tanstack/pacer@0.7.0

## 0.6.0

### Minor Changes

- breaking: remove `onError`, `onSuccess`, `onSettled` options from `AsyncQueuer` in favor of options of the same name on the `AsyncQueuer` ([#22](https://github.com/TanStack/pacer/pull/22))
  feat: standardize error handling callbacks on `AsyncQueuer`, `AsyncDebouncer`, `AsyncRateLimiter`, and `AsyncThrottler`
  feat: add `throwOnError` option to `AsyncQueuer`, `AsyncDebouncer`, `AsyncRateLimiter`, and `AsyncThrottler`

### Patch Changes

- Updated dependencies [[`b3d5247`](https://github.com/TanStack/pacer/commit/b3d52477a387f52b0242d2d753f5f271beb92283)]:
  - @tanstack/pacer@0.6.0

## 0.5.0

### Minor Changes

- feat: let enabled, wait, limit, window, and concurrency options support callback variants ([#20](https://github.com/TanStack/pacer/pull/20))
  breaking: set queuer to be started by default

### Patch Changes

- Updated dependencies [[`a3294e7`](https://github.com/TanStack/pacer/commit/a3294e722915f3a17ea6a1333978994c57568a57)]:
  - @tanstack/pacer@0.5.0

## 0.4.0

### Minor Changes

- Added fixed and sliding windowTypes to rate limiters ([#17](https://github.com/TanStack/pacer/pull/17))
  Added `getIsExecuting` to `AsyncRateLimiter`

### Patch Changes

- Updated dependencies [[`f12ba56`](https://github.com/TanStack/pacer/commit/f12ba561d9eafb6a19a16514f8db1a2f5f6fda82)]:
  - @tanstack/pacer@0.4.0

## 0.3.0

### Minor Changes

- - breaking: renamed `useQueuerState` hook to `useQueuedState` ([#12](https://github.com/TanStack/pacer/pull/12))
  - breaking: changed return signature of `useQueuedState` to include the `addItem` function
  - feat: add `useQueuedValue` hook

### Patch Changes

- Updated dependencies [[`35efeea`](https://github.com/TanStack/pacer/commit/35efeeab76d54a1479bd158db9b804b60e87d89b)]:
  - @tanstack/pacer@0.3.0

## 0.2.0

### Minor Changes

- - updated to use new `@tanstack/pacer` package with all of its breaking changes ([`19cee99`](https://github.com/TanStack/pacer/commit/19cee995d79bc16077c9a28fc5f6ab251d626e16))

### Patch Changes

- Updated dependencies [[`19cee99`](https://github.com/TanStack/pacer/commit/19cee995d79bc16077c9a28fc5f6ab251d626e16)]:
  - @tanstack/pacer@0.2.0

## 0.1.0

### Minor Changes

- feat: Initial release ([#2](https://github.com/TanStack/pacer/pull/2))

### Patch Changes

- Updated dependencies [[`4559434`](https://github.com/TanStack/pacer/commit/4559434d61a06cdfb091e1243d23349c3d909222)]:
  - @tanstack/pacer@0.1.0
