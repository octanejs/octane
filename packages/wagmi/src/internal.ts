import { createContext, subSlot } from 'octane';

export { subSlot };
import type { ResolvedRegister } from '@wagmi/core';

export const WagmiContext = createContext<ResolvedRegister['config'] | undefined>(undefined);
