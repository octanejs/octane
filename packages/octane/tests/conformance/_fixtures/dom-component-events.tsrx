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

// NOTE: <link> is hoisted document metadata in octane (lifted into <head> by the
// compiler), so the test queries document.head for it.
export function LinkEvents(props) @{
	<link href="http://example.org/link" onLoad={props.onLoad} onError={props.onError} />
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
