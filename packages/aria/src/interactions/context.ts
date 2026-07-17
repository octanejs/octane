// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/interactions/context.ts).
// octane adaptations: React.createContext → octane createContext (octane's Context is
// callable-as-Provider, `.Provider` stays as an identity alias, so consumers are unchanged);
// React's MutableRefObject type → a local structural alias; `displayName` is stamped through
// a cast (octane's Context type doesn't declare it, but the runtime reads it for diagnostics).
import type { FocusableElement } from '@react-types/shared';
import { createContext, type Context } from 'octane';

import type { PressProps } from './usePress';

type MutableRefObject<T> = { current: T };

interface IPressResponderContext extends PressProps {
	register(): void;
	ref?: MutableRefObject<FocusableElement>;
}

export const PressResponderContext: Context<IPressResponderContext> =
	createContext<IPressResponderContext>({ register: () => {} });
(PressResponderContext as any).displayName = 'PressResponderContext';
