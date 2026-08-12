import { useFont } from '@octanejs/drei';

function LoadedFont(props) @{
	const font = useFont(props.font);
	props.onLoad(font);
	null;
}

export function FontBoundary(props) @{
	@try {
		<LoadedFont {...props} />
	} @pending {
		null;
	}
}
