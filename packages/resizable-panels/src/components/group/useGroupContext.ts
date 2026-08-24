import { useContext } from 'octane';
import { GroupContext } from './GroupContext';

export function useGroupContext(_slot?: symbol) {
	const value = useContext(GroupContext);
	if (value === null) {
		throw new Error(
			'Group Context not found; did you render a Panel or Separator outside of a Group?',
		);
	}
	return value;
}
