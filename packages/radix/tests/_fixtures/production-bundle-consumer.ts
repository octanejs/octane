import { createElement, createRoot } from 'octane';
import { Separator } from '@octanejs/radix';

createRoot(document.getElementById('root')!).render(
	createElement(Separator.Root, { id: 'selected-separator', orientation: 'vertical' }),
);
