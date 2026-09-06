'use client';
import * as React from 'octane';

const noop = () => {};

export const useIsoLayoutEffect = typeof document !== 'undefined' ? React.useLayoutEffect : noop;
