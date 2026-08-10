/** @jsxImportSource @octanejs/lynx/intrinsics */
import { useMainThreadRef } from '@octanejs/lynx';

/**
 * The documented Lynx main-thread scripting pattern: a `'main thread'` handler
 * writes an element style and publishes it with `__FlushElementTree()`. Hosts
 * that dispatch the handler from inside their own element-tree work cannot take
 * that flush inline, so this is the shape the runtime has to keep working.
 */
export function App() @{
	const barRef = useMainThreadRef<object>();
	const heightRef = useMainThreadRef<number>(8);

	const onTapMTS = () => {
		'main thread';
		const bar = barRef.current;
		if (bar === null || bar === undefined) return;
		const height = heightRef.current + 8;
		heightRef.current = height;
		__AddInlineStyle(bar, 'height', height + 'px');
		__FlushElementTree();
	};

	<view id="flush-probe" main-thread:bindtap={onTapMTS}>
		<view id="flush-bar" main-thread:ref={barRef} style="width: 40px; height: 8px" />
		<text>{'Tap to flush'}</text>
	</view>
}
