/** @jsxImportSource octane */
import { createContext } from 'octane';
import { createContext as createReactContext } from 'react';

export const Theme = createContext<string | undefined>('octane default');
export const ReactTheme = createReactContext<string | undefined>('react default');
