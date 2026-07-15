import { getCategoricalColor } from './categoricalColor';
import useTheme from './useTheme.tsrx';
import warn from './warn';

export type CategoricalColorAccessor<Domain extends readonly string[]> =
	(key: Domain[number]) => string;

export default function useCategoricalScale<Domain extends readonly string[]>(domain: Domain): CategoricalColorAccessor<Domain> {
	const theme = useTheme();

	return (key) => {
		const index = domain.indexOf(key);

		if (index < 0) {
			warn(
				`[@octanejs/visx/theme] useCategoricalScale received "${key}" outside its domain; using index 0.`,
			);
			return getCategoricalColor(theme.colors.categorical, 0);
		}

		return getCategoricalColor(theme.colors.categorical, index);
	};
}
