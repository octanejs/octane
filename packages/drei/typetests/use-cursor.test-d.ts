import { useCursor } from '../src/index.js';

useCursor(true);
useCursor(false, 'grab', 'default', document.body);

// @ts-expect-error hovered must be boolean
useCursor('yes');
// @ts-expect-error container must be an HTML element
useCursor(true, 'pointer', 'auto', {});
