import { GroqLogo, GroqMonogram, SanityLogo, SanityMonogram } from '@octanejs/sanity-logos';

export function SanityLogoGallery(
	props: { onLogoRef?: (node: SVGSVGElement | null) => void } = {},
) @{
	<section>
		<SanityLogo id="sanity-default" ref={props.onLogoRef} aria-label="Sanity" />
		<SanityLogo id="sanity-dark" dark />
		<SanityMonogram id="monogram-default" />
		<SanityMonogram id="monogram-light" scheme="light" />
		<SanityMonogram id="monogram-dark" scheme="dark" />
		<SanityMonogram id="monogram-custom" color={{ bg1: '#123456', bg2: 'unused', fg: '#abcdef' }} />
		<GroqLogo id="groq-logo" />
		<GroqMonogram id="groq-monogram" />
	</section>
}
