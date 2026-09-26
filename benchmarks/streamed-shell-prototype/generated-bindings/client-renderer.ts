import { activate } from './renderer.ts';
import { start } from './host.ts';

document.documentElement.dataset.automaticMode = 'renderer';
await start(activate);
