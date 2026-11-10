/** @jsxImportSource octane */
import { createRoot, hydrateRoot } from 'octane';
import { App } from './App.tsrx';
import { startSession } from '../shared/client.ts';
import '../styles.css';

const target = document.getElementById('root')!;
const { session, hydrate } = startSession();
const props = { title: 'Shelf — Octane', session };
if (hydrate) hydrateRoot(target, App, props);
else createRoot(target).render(App, props);
