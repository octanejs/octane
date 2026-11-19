import { createRoot, flushSync } from 'octane';
import { drainPassiveEffects } from 'octane/internal/client';
import { StrayOwners } from './misuse.tsrx';

createRoot(document.getElementById('root')!).render(StrayOwners);
flushSync(() => {});
drainPassiveEffects();
flushSync(() => {});
