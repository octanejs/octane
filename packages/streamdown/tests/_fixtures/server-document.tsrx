import { Streamdown } from '@octanejs/streamdown';
import type { ExtraProps } from '@octanejs/streamdown';
import { code } from '@octanejs/streamdown/code';
import { math } from '@octanejs/streamdown/math';
import type { Octane } from 'octane/jsx-runtime';

export type ServerDocumentProps = {
	content: string;
	mode?: 'static' | 'streaming';
};

export function ServerDocument({ content, mode = 'static' }: ServerDocumentProps) {
	return <Streamdown
		controls={false}
		mode={mode}
		parseIncompleteMarkdown={mode === 'streaming'}
		plugins={{ math }}
	>{content}</Streamdown>;
}

type ServerHeadingProps = Octane.JSX.IntrinsicElements['h1'] & ExtraProps;

function ServerHeading({ node, children, ...props }: ServerHeadingProps) {
	return <h2
		{...props}
		data-server-hast-node={node?.tagName}
		data-testid="server-heading"
	>{children}</h2>;
}

const serverComponents = {
	h1: ServerHeading,
};

export function ServerFeatureDocument({ content, mode = 'static' }: ServerDocumentProps) {
	return <Streamdown
		components={serverComponents}
		controls={false}
		mode={mode}
		parseIncompleteMarkdown={mode === 'streaming'}
		plugins={{ code, math }}
	>{content}</Streamdown>;
}
