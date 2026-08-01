import { createElement, memo } from 'octane';
import { createStaticHtml } from './static-html.js';

export default createStaticHtml(createElement, memo);
