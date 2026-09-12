import { createRoot, flushSync } from 'octane';
import { Attributes, Metadata } from './cases.tsrx';

globalThis.attributeBench = { createRoot, flushSync, Attributes, Metadata };
