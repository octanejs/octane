import { createRoot } from 'octane';
import { App } from './App.tsrx';
import { useThreadlineStore } from './store';
import './styles.css';

const target = document.getElementById('root');
if (target === null) throw new Error('Threadline requires a #root element');

const store = useThreadlineStore;
const onPopState = () => store.getState().syncLocation();
window.addEventListener('popstate', onPopState);
store.getState().bootstrap();

createRoot(target).render(App);
