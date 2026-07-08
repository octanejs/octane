// Recharts' own isolated redux context — port of state/RechartsReduxContext.ts.
// A dedicated context (NOT @octanejs/redux's default) so a chart's store never
// interferes with an app-level redux store the host page may be running.
import { createContext } from 'octane';
import type { ReactReduxContextValue } from '@octanejs/redux';

export const RechartsReduxContext = createContext<ReactReduxContextValue | null>(null);
