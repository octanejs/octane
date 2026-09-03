// Known JSX event props use Octane's delegated native event path. Custom
// elements route all other on* props to case-sensitive addEventListener calls.
// Keep this list shared by direct compiler bindings and runtime prop spreads.
const names =
	'Abort AnimationEnd AnimationIteration AnimationStart AuxClick BeforeInput BeforeToggle Blur Cancel CanPlay CanPlayThrough Change Click Close CompositionEnd CompositionStart CompositionUpdate ContextMenu Copy Cut DoubleClick Drag DragEnd DragEnter DragExit DragLeave DragOver DragStart Drop DurationChange Emptied Encrypted Ended Error Focus GotPointerCapture Input Invalid KeyDown KeyPress KeyUp Load LoadedData LoadedMetadata LoadStart LostPointerCapture MouseDown MouseEnter MouseLeave MouseMove MouseOut MouseOver MouseUp Paste Pause Play Playing PointerCancel PointerDown PointerEnter PointerLeave PointerMove PointerOut PointerOver PointerUp Progress RateChange Reset Resize Scroll ScrollEnd Seeked Seeking Select Stalled Submit Suspend TimeUpdate Toggle TouchCancel TouchEnd TouchMove TouchStart TransitionCancel TransitionEnd TransitionRun TransitionStart VolumeChange Waiting Wheel';
let delegatedEventProps;

/** Whether a prop is a recognized delegated JSX event rather than a custom event. */
export function isDelegatedEventProp(name) {
	if (delegatedEventProps === undefined) {
		delegatedEventProps = new Set();
		for (const event of names.split(' ')) {
			delegatedEventProps.add('on' + event);
			delegatedEventProps.add('on' + event + 'Capture');
		}
	}
	return delegatedEventProps.has(name);
}
