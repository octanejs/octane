import * as React from 'octane';

export function useMounted() {
	const [mounted, setMounted] = React.useState(false);
	React.useEffect(() => {
		setMounted(true);
	}, []);
	return mounted;
}
