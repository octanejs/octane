import { createRoot } from 'octane';
import { App } from './App.tsrx';
import './styles.css';

const target = document.getElementById('root');
if (target === null) throw new Error('Pagecraft requires a #root element');

createRoot(target).render(App);
