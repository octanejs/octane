import { useStructuralMemo } from '@octanejs/visx/kernel';
import { useMemo } from 'octane';
import createCategoricalIndex from './categoricalIndex';
import { getCategoricalColor } from './categoricalColor';
import useTheme from './useTheme.tsrx';
import warn from './warn';

export type CategoricalColorAccessor<Domain extends readonly string[]> =
	(key: Domain[number]) => string;

export default function useCategoricalScale<Domain extends readonly string[]>(domain: Domain): CategoricalColorAccessor<Domain> {
	const theme = useTheme();
	const stableDomain = useStructuralMemo(domain, 1);
	const colors = theme.colors.categorical;

	return useMemo(() => {
		const indexOf = createCategoricalIndex(stableDomain);
		return (key) => {
			const index = indexOf(key);

			if (index < 0) {
				warn(
					`[@octanejs/visx/theme] useCategoricalScale received "${key}" outside its domain; using index 0.`,
				);
				return getCategoricalColor(colors, 0);
			}

			return getCategoricalColor(colors, index);
		};
	}, [colors, stableDomain]);
}
