import { createRoot, drainPassiveEffects, flushSync } from 'octane';
import { StrayOwners } from './misuse.tsrx';

createRoot(document.getElementById('root')!).render(StrayOwners);
flushSync(() => {});
drainPassiveEffects();
flushSync(() => {});
