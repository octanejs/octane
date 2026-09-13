/** @jsxImportSource octane */
import { useCollapse, useFloatingWindow, useScrollSpy } from '@octanejs/mantine-hooks';
import { useRef } from 'octane';
export function Consumer() {
	const host = useRef<HTMLDivElement | null>(null);
	const collapse = useCollapse({ expanded: true });
	const floating = useFloatingWindow<HTMLDivElement>();
	useScrollSpy({ scrollHost: host });
	return (
		<section>
			<div ref={host}>
				<h2>Heading</h2>
			</div>
			<div {...collapse.getCollapseProps({ ref: host })} />
			<div ref={floating.ref} />
		</section>
	);
}
