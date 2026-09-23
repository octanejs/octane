import { createContext } from 'octane';

// Declared in its own module so the compiler's same-module Context.Provider
// diagnostic cannot see it; the runtime's dev getter is the only guard.
export const Theme = createContext('light');
