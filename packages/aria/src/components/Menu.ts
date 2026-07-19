// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Menu.tsx).
// PHASE-5: rest of this module pending — only the `RootMenuTriggerStateContext` token is
// ported here so the overlay/trigger tiers can wire against it.
// octane adaptations: `.tsx` → `.ts`; `RootMenuTriggerState` comes from the binding's stately
// port.
import { createContext } from 'octane';

import type { RootMenuTriggerState } from '../stately/menu/useMenuTriggerState';

export const RootMenuTriggerStateContext = createContext<RootMenuTriggerState | null>(null);
