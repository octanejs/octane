import { adoptBindings, type BindingSource } from 'octane/behavior';
import { MetricsFrame, type MetricsFrameProps } from './MetricsFrame.tsrx';
import { MetricsActions, type MetricsActionsProps } from './MetricsActions.tsrx';

export function adoptFrame(
	root: Element,
	source: BindingSource<MetricsFrameProps>,
	signal: AbortSignal,
) {
	return adoptBindings(root, MetricsFrame, source, { signal });
}

export function adoptActions(
	root: Element,
	source: BindingSource<MetricsActionsProps>,
	signal: AbortSignal,
) {
	return adoptBindings(root, MetricsActions, source, { signal });
}
