import { createContext } from 'octane';
import type { SeoRegistry } from './registry.js';

export const SeoContext = createContext<SeoRegistry | null>(null);
