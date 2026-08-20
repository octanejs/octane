import type { OctaneNode } from 'octane';
import type { Unhead } from 'unhead/types';
import { createContext } from 'octane';

export interface UniversalUnheadProviderProps {
	children?: OctaneNode;
	value: Unhead;
}

export const UnheadContext = /* @__PURE__ */ createContext<Unhead | null>(null);
