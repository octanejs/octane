import { useContext } from 'octane';
import { LayoutGroup, LayoutGroupContext } from '@octanejs/motion';

function GroupIdLabel() @{
	const group = useContext(LayoutGroupContext);
	<span id="layout-group-id">{group.id as string}</span>
}

export function NestedGroupId() @{
	<LayoutGroup id="a-b">
		<LayoutGroup id="c">
			<GroupIdLabel />
		</LayoutGroup>
	</LayoutGroup>
}
