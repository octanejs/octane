// A `.ts` component (like @octanejs/floating-ui's FloatingOverlay) that forwards its
// children onto a HOST element via createElement — the shape that exercised two octane
// gaps when a `.tsrx` parent passes children (render-fn form).
import { createElement } from 'octane';

export function HostWrap(props: any): any {
	return createElement('div', { class: 'wrap', children: props.children });
}
