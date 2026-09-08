import {
	groqLogo,
	groqMonogram,
	sanityLogoDark,
	sanityLogoDefault,
	sanityMonogramCustom,
	sanityMonogramDark,
	sanityMonogramDefault,
	sanityMonogramLight,
} from './data';
import { escapeSvgAttribute, renderLogo } from './renderLogo';
import type { SanityLogoProps, SanityLogoSvgProps, SanityMonogramProps } from './types';

export function GroqLogo(props: SanityLogoSvgProps = {}) {
	return renderLogo(groqLogo, props);
}

export function GroqMonogram(props: SanityLogoSvgProps = {}) {
	return renderLogo(groqMonogram, props);
}

export function SanityLogo(props: SanityLogoProps = {}) {
	const { dark, ...svgProps } = props;
	return renderLogo(dark ? sanityLogoDark : sanityLogoDefault, svgProps);
}

export function SanityMonogram(props: SanityMonogramProps = {}) {
	const { scheme = 'default', color, ...svgProps } = props;
	if (color) {
		const body = sanityMonogramCustom.body
			.replaceAll('__OCTANE_SANITY_BG__', escapeSvgAttribute(color.bg1))
			.replaceAll('__OCTANE_SANITY_FG__', escapeSvgAttribute(color.fg));
		return renderLogo({ ...sanityMonogramCustom, body }, svgProps);
	}
	const data =
		scheme === 'light'
			? sanityMonogramLight
			: scheme === 'dark'
				? sanityMonogramDark
				: sanityMonogramDefault;
	return renderLogo(data, svgProps);
}
