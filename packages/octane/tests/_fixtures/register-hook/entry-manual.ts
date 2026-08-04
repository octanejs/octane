import { prerender } from 'octane/static';
import { ManualApp } from './ManualApp';

const { html } = await prerender(ManualApp, { name: 'Octane' });

process.stdout.write(html);
