import { descriptorChildren } from 'octane';

function Slot(props: { children?: unknown }) {
	return props.children;
}

export default descriptorChildren(Slot);
