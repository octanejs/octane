import { createElement } from 'octane';
import type { SanityLogoSvgProps } from './types';

export interface LogoData {
	attributes: Record<string, string>;
	body: string;
}

export function renderLogo(data: LogoData, props: SanityLogoSvgProps = {}) {
	const {
		children: _children,
		dangerouslySetInnerHTML: _dangerouslySetInnerHTML,
		ref,
		...rest
	} = props;
	return createElement('svg', {
		...data.attributes,
		...rest,
		ref,
		dangerouslySetInnerHTML: { __html: data.body },
	});
}

export function escapeSvgAttribute(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#x27;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}
