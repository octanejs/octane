import { prerender } from 'octane/static';
import { App } from './App';

const { html } = await prerender(App, { name: 'Octane' });

process.stdout.write(html);
