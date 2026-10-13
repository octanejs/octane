import { createRoot } from 'react-dom/client';

import { App } from './app';

const container = document.getElementById('root');
if (!container) throw new Error('missing #root');

createRoot(container).render(<App />);
