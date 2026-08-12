import { useCursor } from '@octanejs/drei';

export function UseCursorScene(props) @{
	useCursor(props.hovered, props.over, props.out, props.container);
	null;
}

export function UseCursorDefaultsScene(props) @{
	useCursor(props.hovered);
	null;
}
