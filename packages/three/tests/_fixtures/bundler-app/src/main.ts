import { createRoot } from 'octane';
import { App } from './App.tsrx';

const target = document.getElementById('root');
if (target === null) throw new Error('Octane Three bundler fixture requires #root');

createRoot(target).render(App);
