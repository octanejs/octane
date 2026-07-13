// Compatibility counterpart of `@reduxjs/toolkit/react`: the root Toolkit
// surface plus the dynamic-middleware helper bound to @octanejs/redux.
export * from '@reduxjs/toolkit';
export { createDynamicMiddleware } from '../dynamicMiddleware/react';
export type { CreateDispatchWithMiddlewareHook } from '../dynamicMiddleware/react';
