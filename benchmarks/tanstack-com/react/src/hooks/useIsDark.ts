import { useTheme } from '~/components/ThemeProvider';

export function useIsDark(): boolean {
	const { resolvedTheme } = useTheme();
	return resolvedTheme === 'dark';
}
