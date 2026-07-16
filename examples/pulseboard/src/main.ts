import { createRoot } from 'octane';
import { App } from './App.tsrx';
import './styles.css';

const target = document.getElementById('root');
if (!target) throw new Error('missing #root');
createRoot(target).render(App);
