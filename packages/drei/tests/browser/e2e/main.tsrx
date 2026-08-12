import { createRoot } from 'octane';
import { App } from './App.tsrx';

createRoot(document.querySelector('#root')!).render(<App />);
