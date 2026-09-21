import { Drawer } from '@octanejs/base-ui/drawer';

export function MeasuredDrawer() @{
	<Drawer.Root open modal={false}>
		<Drawer.Portal>
			<Drawer.Viewport>
				<Drawer.Popup id="popup" style={{ width: '220px' }}>
					<Drawer.Title>Measured drawer</Drawer.Title>
					<Drawer.Description>Layout follows the reported frontmost height.</Drawer.Description>
				</Drawer.Popup>
			</Drawer.Viewport>
		</Drawer.Portal>
	</Drawer.Root>
}
