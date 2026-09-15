import { createRoot, delegateEvents, hydrateRoot } from 'octane';
import { LayoutHydrationFixture } from '../../_fixtures/layout-hydration.tsrx';

delegateEvents(['focus', 'blur', 'keydown', 'pointerdown', 'pointerup']);
const root = document.querySelector('#root');
if (!(root instanceof HTMLElement)) throw new Error('Missing root');
const props = JSON.parse(root.dataset.props!);
const serverPanel = root.querySelector('#layout-left');
if (root.childNodes.length) hydrateRoot(root, LayoutHydrationFixture, props);
else createRoot(root).render(LayoutHydrationFixture, props);
root.dataset.adopted = String(serverPanel === root.querySelector('#layout-left'));
root.dataset.ready = 'true';
