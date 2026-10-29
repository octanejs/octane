import { createContext } from 'octane';

import type { RegisterListener } from './types';

export const DndMonitorContext = createContext<RegisterListener | null>(null);
