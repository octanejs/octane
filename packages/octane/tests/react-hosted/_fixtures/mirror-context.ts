/**
 * Root-local Octane mirror contexts for the React-hosted Phase 0 spike
 * (docs/react-hosted-octane-compat-plan.md §6.2). The hosted islands read these
 * ordinary Octane contexts; the React owner bridge resolves each one to a real
 * React context, bootstraps the committed value from the host Fiber once, and
 * keeps it live through `React.use(context)` in the wrapper.
 */
import { createContext } from '../../../src/index.js';

export const MirrorTheme = createContext<string>('mirror-default-theme');
export const MirrorLocale = createContext<string>('mirror-default-locale');
