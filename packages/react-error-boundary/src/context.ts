import { createContext } from 'octane';
import type { ErrorBoundaryContextType } from './types.ts';

export const ErrorBoundaryContext = createContext<ErrorBoundaryContextType | null>(null);
