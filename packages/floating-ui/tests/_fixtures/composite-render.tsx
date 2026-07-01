import { Composite, CompositeItem } from '@octanejs/floating-ui';

export function CompositeRenderPropApp() {
	return (
		<Composite class="toolbar" orientation="horizontal">
			<CompositeItem class="item" render={<button class="rendered-button">Save</button>} />
		</Composite>
	);
}
