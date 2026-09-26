import { hydrateRoot } from 'octane';
import { Shell } from './Shell.tsrx';

hydrateRoot(document.getElementById('root')!, Shell, {});
document.documentElement.dataset.shellReady = 'true';
