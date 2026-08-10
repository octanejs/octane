import { useState } from 'octane';

function useAdoptedKind() {
	const [kind, setKind] = useState<'html' | 'svg' | null>(null);
	const ref = (node: Element | null) => {
		if (node) setKind(node.namespaceURI === 'http://www.w3.org/2000/svg' ? 'svg' : 'html');
	};
	return { kind, ref };
}

export function HtmlAdoption() @{
	const { kind, ref } = useAdoptedKind();
	<div ref={ref} data-kind={kind ?? 'server'} style={kind === 'html' ? { transform: 'translate(3px,4px)' } : undefined}>html</div>
}

export function SvgAdoption() @{
	const { kind, ref } = useAdoptedKind();
	<svg ref={ref} data-kind={kind ?? 'server'} transform={kind === 'svg' ? 'translate(3,4)' : undefined}><circle cx="1" cy="1" r="1" /></svg>
}
