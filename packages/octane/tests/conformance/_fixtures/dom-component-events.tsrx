import { createPortal } from 'octane';

// Fixtures for dom-component-events.test.ts — non-bubbling resource events
// (error/load on <source>/<link>/SVG <image>), nested-root event ordering, and
// the iOS tap-highlight onclick stub.

export function SourceError(props) @{
	<video id="vid">
		<source src="http://example.org/video" type="video/mp4" onError={props.onError} />
	</video>
}

export function SvgImageEvents(props) @{
	<svg id="simg">
		<image xlink:href="http://example.org/image" onError={props.onError} onLoad={props.onLoad} />
	</svg>
}

// React keeps links with resource lifecycle handlers in their authored DOM
// position so capture and bubble events still reach their logical ancestors.
export function LinkEvents(props) @{
	<link
		rel="preload"
		as="style"
		href="http://example.org/link"
		onLoad={props.onLoad}
		onError={props.onError}
	/>
}

export function LoadOnlyLink(props: { handler: (event: Event) => void }) @{
	<link rel="preload" as="style" href="http://example.org/load-only" onLoad={props.handler} />
}

export function ErrorOnlyLink(props: { handler: (event: Event) => void }) @{
	<link rel="preload" as="style" href="http://example.org/error-only" onError={props.handler} />
}

export function CaptureOnlyLink(props: { handler: (event: Event) => void }) @{
	<link
		rel="canonical"
		href="http://example.org/capture-only"
		onLoadCapture={props.handler}
		onErrorCapture={props.handler}
	/>
}

type ResourceEventHandlers = {
	onLoad?: (event: Event) => void;
	onLoadCapture?: (event: Event) => void;
	onError?: (event: Event) => void;
	onErrorCapture?: (event: Event) => void;
};

export function LinkSpreadEvents(props: { handlers: ResourceEventHandlers }) @{
	<link href="http://example.org/spread-link" {...props.handlers} />
}

export function NestedLinkEvents(props: {
	ancestor: ResourceEventHandlers;
	target: ResourceEventHandlers;
}) @{
	<>
		<link rel="canonical" href="http://example.org/canonical-link" />
		<div
			class="link-parent"
			onLoad={props.ancestor.onLoad}
			onLoadCapture={props.ancestor.onLoadCapture}
			onError={props.ancestor.onError}
			onErrorCapture={props.ancestor.onErrorCapture}
		>
			<link
				rel="preload"
				as="style"
				href="http://example.org/nested-link"
				onLoad={props.target.onLoad}
				onLoadCapture={props.target.onLoadCapture}
				onError={props.target.onError}
				onErrorCapture={props.target.onErrorCapture}
			/>
		</div>
	</>
}

// Nested-roots ordering — outer app hosts the inner root's container.
export function OuterApp(props) @{
	<div id="outer" ref={props.oref} onClick={props.onBubble} onClickCapture={props.onCapture} />
}

export function InnerApp(props) @{
	<div id="inner" ref={props.iref} onClick={props.onBubble} onClickCapture={props.onCapture} />
}

// iOS tap-highlight: React stamps a noop `onclick` PROPERTY on elements with an
// onClick prop (and on portal roots) so Safari dispatches click at all.
export function TapClick(props) @{
	<div id="tap" onClick={props.h} />
}

// Portal into a foreign target — React stamps noop `onclick` on the portal ROOT.
export function PortalClick(props) @{
	<div id="phost">{createPortal(
		() => @{
			<div id="pclick" onClick={props.h}>{'p'}</div>
		},
		props.target,
	)}</div>
}
