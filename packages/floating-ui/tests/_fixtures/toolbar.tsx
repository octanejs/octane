import { Composite, CompositeItem } from '@octanejs/floating-ui';

export function Toolbar() {
	return (
		<Composite class="toolbar" orientation="horizontal">
			<CompositeItem class="item a" />
			<CompositeItem class="item b" />
			<CompositeItem class="item c" />
		</Composite>
	);
}
