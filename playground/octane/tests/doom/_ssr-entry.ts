import { renderToString } from 'octane/server';
import { DoomDemo } from '../../src/demos/doom/Doom.tsrx';

export const html = renderToString(DoomDemo).html;
