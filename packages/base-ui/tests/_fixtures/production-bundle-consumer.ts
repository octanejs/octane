import { createElement, createRoot } from 'octane';
import { Separator } from '@octanejs/base-ui';

createRoot(document.getElementById('root')!).render(
	createElement(Separator, { id: 'selected-separator', orientation: 'vertical' }),
);
