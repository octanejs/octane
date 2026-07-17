/**
 * REAL React 19 contexts read by the Phase 2 island fixtures. Created in a
 * plain `.ts` module so the `.tsrx` islands and the React-side tests share the
 * exact same context object identities.
 */
import * as React from 'react';

export const HostTheme = React.createContext<string>('host-theme-default');
export const HostLocale = React.createContext<string>('host-locale-default');
