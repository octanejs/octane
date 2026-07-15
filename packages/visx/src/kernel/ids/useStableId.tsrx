import { useId } from 'octane';

export default function useStableId(prefix = 'visx') {
	const reactId = useId().replace(/:/g, '');

	return prefix ? `${prefix}-${reactId}` : reactId;
}
