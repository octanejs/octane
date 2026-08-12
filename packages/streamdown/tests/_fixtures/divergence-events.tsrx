import { useState } from 'octane';
import { Streamdown, type ExtraProps } from '@octanejs/streamdown';
import type { Octane } from 'octane/jsx-runtime';

type AnchorProps = Octane.JSX.IntrinsicElements['a'] & ExtraProps;

export function NativeEventProbe() {
	const [result, setResult] = useState('pending');
	function NativeAnchor({ node: _node, children, ...props }: AnchorProps) {
		return <a
			{...props}
			onClick={(event) => {
				event.preventDefault();
				setResult(
					event instanceof MouseEvent && event.currentTarget instanceof HTMLAnchorElement
						? 'native-anchor'
						: 'unexpected-event',
				);
			}}
		>{children}</a>;
	}
	return <section>
		<output data-testid="event-result">{result}</output>
		<Streamdown
			components={{ a: NativeAnchor }}
			controls={false}
			linkSafety={{ enabled: false }}
			mode="static"
		>[event](https://example.com)</Streamdown>
	</section>;
}
