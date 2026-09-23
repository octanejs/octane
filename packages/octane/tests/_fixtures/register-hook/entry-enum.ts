import { prerender } from 'octane/static';
import { EnumApp, Tone } from './EnumApp';

const { html } = await prerender(EnumApp, { tone: Tone.Loud });

process.stdout.write(html);
