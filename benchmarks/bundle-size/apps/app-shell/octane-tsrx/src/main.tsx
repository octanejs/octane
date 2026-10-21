/** @jsxImportSource octane */
import { hydrateRoot } from 'octane';

import { App } from './app.tsrx';

const container = document.getElementById('root');
if (!container) throw new Error('missing #root');

hydrateRoot(container, <App />);
