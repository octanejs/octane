import { HeadManager } from '@inertiajs/core';
import { createContext } from 'octane';

const headContext = createContext<HeadManager | null>(null);
export default headContext;
