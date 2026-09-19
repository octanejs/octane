import { createContext } from 'octane';

import { createStore } from '../store';

const StoreContext = createContext<ReturnType<typeof createStore> | null>(null);

export const Provider = StoreContext;
export default StoreContext;
