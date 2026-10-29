// @ts-nocheck
import { lazy, createRoot } from 'octane';

const Page = lazy(() => import('./Page'));

function App() @{
  @try { <Page /> } @pending { <div class="spinner">Loading…</div> }
}

createRoot(document.getElementById('root')).render(App);
