import './style.css';
import { hydrateRoot } from 'octane';
import { Shell } from './Shell.tsrx';

hydrateRoot(document.getElementById('root')!, Shell, { name: 'Ada' });
document.documentElement.dataset.shellReady = 'true';
