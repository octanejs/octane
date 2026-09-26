import { adoptBindings, type BindingSource } from 'octane/behavior';
import { Frame, type FrameProps } from './Frame.tsrx';
import { Ready, type ReadyProps } from './Ready.tsrx';

export function adoptFrame(root: Element, source: BindingSource<FrameProps>, signal: AbortSignal) {
	return adoptBindings(root, Frame, source, { signal });
}

export function adoptReady(root: Element, source: BindingSource<ReadyProps>, signal: AbortSignal) {
	return adoptBindings(root, Ready, source, { signal });
}
