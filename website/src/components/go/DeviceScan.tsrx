// The "run this on a phone" half of a <Go> panel: a QR code for the example's
// *native* bundle, which Lynx Explorer opens directly.
//
// The code is generated in the browser from the page's own origin rather than
// baked in at build time, so a preview deployment sends readers to its own
// bundle instead of production's — and a local run still produces a code that
// works from any device that can reach the dev server.
//
// It is drawn dark-on-white in both themes. A QR code is scanned by a camera,
// not read by a person, and inverting it on a dark page costs scans on readers
// whose scanner does not handle inverted codes.
import { useEffect, useState } from 'octane';

const LYNX_EXPLORER_GUIDE = 'https://lynx.dev/guide/start/quick-start';

interface DeviceScanProps {
	/** Absolute URL of the `.lynx.bundle` Lynx Explorer should open. */
	url: string;
}

export function DeviceScan(props: DeviceScanProps) @{
	const [svg, setSvg] = useState('');
	const [failed, setFailed] = useState(false);

	// Explorer's fullscreen flag: without it the bundle renders inside the
	// Explorer chrome and the example's own safe-area handling has nothing to
	// work with.
	const target = props.url + '?fullscreen=true';

	useEffect(() => {
		let live = true;
		// The encoder is a page-weight cost only readers who open this tab pay.
		import('qrcode').then(
			(qrcode) => qrcode.default.toString(target, {
				type: 'svg',
				margin: 1,
				errorCorrectionLevel: 'M',
				color: { dark: '#16181d', light: '#ffffff' },
			}),
		).then((markup) => {
			if (live) setSvg(markup);
		}).catch(() => {
			if (live) setFailed(true);
		});
		return () => {
			live = false;
		};
	});

	<div class="scan">
		<div class="scan-card">
			@if (svg) {
				<div class="scan-code" dangerouslySetInnerHTML={{ __html: svg }}></div>
			} @else {
				<div class="scan-code scan-code-empty" aria-hidden="true"></div>
			}
		</div>
		<p class="scan-lead">
			{failed
				? 'The QR code could not be generated. Open the bundle URL below in Lynx Explorer instead.'
				: 'Scan with Lynx Explorer to run this example natively on your phone.'}
		</p>
		<p class="scan-url">{target}</p>
		<a class="scan-link" href={LYNX_EXPLORER_GUIDE} target="_blank" rel="noreferrer">
			Get Lynx Explorer ↗
		</a>

		<style>
			.scan {
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				gap: 0.75rem;
				width: 100%;
				height: 100%;
				padding: 1.5rem 1.25rem;
				text-align: center;
			}
			/* White card in both themes: a camera reads the code, and an inverted
			   one is not universally scannable. */
			.scan-card {
				padding: 0.6rem;
				border-radius: 0.75rem;
				background: #ffffff;
				box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
			}
			.scan-code,
			.scan-code-empty {
				width: clamp(7rem, 40cqw, 10rem);
				aspect-ratio: 1;
			}
			.scan-code :global(svg) {
				display: block;
				width: 100%;
				height: 100%;
			}
			.scan-lead {
				margin: 0;
				max-width: 18rem;
				color: var(--text-secondary);
				font-size: 0.8rem;
				line-height: 1.5;
			}
			.scan-url {
				margin: 0;
				max-width: 100%;
				overflow-wrap: anywhere;
				color: var(--text-secondary);
				font-family: 'SF Mono', SFMono-Regular, ui-monospace, Menlo, Consolas, monospace;
				font-size: 0.68rem;
				line-height: 1.4;
				opacity: 0.75;
			}
			.scan-link {
				color: var(--accent-text);
				font-size: 0.8rem;
				font-weight: 600;
			}
		</style>
	</div>
}
