import { Tiptap } from '@octanejs/tiptap';
import { BubbleMenu, FloatingMenu } from '@octanejs/tiptap/menus';

export function MenuHarness(props) @{
	<Tiptap editor={props.editor}>
		@if (props.showBubble) {
			<BubbleMenu
				editor={null}
				pluginKey={props.bubblePluginKey}
				shouldShow={props.shouldShow}
				options={props.bubbleOptions}
				class={props.menuClass}
				className={props.menuClassName}
				data-menu-kind="bubble"
				data-version={props.version}
				aria-label={props.ariaLabel}
				style={props.style}
				tabIndex={props.tabIndex}
				onClick={props.onMenuClick}
				ref={props.bubbleRef}
			>
				<button data-menu-action="bubble" onClick={props.onActionClick}>
					{props.label as string}
				</button>
				<button data-menu-action="stop" onClick={props.onStoppedActionClick}>
					stop propagation
				</button>
			</BubbleMenu>
		}
		@if (props.showFloating) {
			<FloatingMenu
				editor={props.editor}
				pluginKey={props.floatingPluginKey}
				shouldShow={props.shouldShow}
				options={props.floatingOptions}
				data-menu-kind="floating"
				ref={props.floatingRef}
			>
				<span data-floating-content="true">floating</span>
			</FloatingMenu>
		}
	</Tiptap>
}

export function AutoKeyMenuPair(props) @{
	<Tiptap editor={props.editor}>
		<BubbleMenu editor={null} shouldShow={props.shouldShow} ref={props.firstRef}>
			<span>first</span>
		</BubbleMenu>
		<BubbleMenu editor={null} shouldShow={props.shouldShow} ref={props.secondRef}>
			<span>second</span>
		</BubbleMenu>
	</Tiptap>
}

export function ServerMenus() @{
	<main id="server-menus">
		<BubbleMenu editor={null}>bubble</BubbleMenu>
		<FloatingMenu editor={null}>floating</FloatingMenu>
		<output>server-safe</output>
	</main>
}
