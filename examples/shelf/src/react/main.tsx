/** @jsxImportSource react */
import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { startSession } from '../shared/client.ts';
import '../styles.css';

const target = document.getElementById('root')!;
const { session, hydrate } = startSession();
if (hydrate) hydrateRoot(target, <App session={session} />);
else createRoot(target).render(<App session={session} />);
