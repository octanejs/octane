export function render(tickable: Tickable, time: number, muteCallbacks: number, internalRender: number, tickMode: tickModes): number;
export function tick(tickable: Tickable, time: number, muteCallbacks: number, internalRender: number, tickMode: number): void;
import type { Tickable } from '../types/index.js';
import { tickModes } from './consts.js';
