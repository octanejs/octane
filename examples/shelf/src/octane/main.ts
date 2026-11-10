import { createRoot } from 'octane';
import { App } from './App.tsrx';
import '../styles.css';

createRoot(document.getElementById('root')!).render(App, { title: 'Shelf — Octane' });
