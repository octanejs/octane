/** @jsxImportSource octane */
import { createRoot } from 'octane';

import { App } from './app';

const container = document.getElementById('root');
if (!container) throw new Error('missing #root');

createRoot(container).render(<App />);
