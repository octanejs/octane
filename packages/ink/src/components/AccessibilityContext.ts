import { createContext } from 'octane/universal/native';

export const accessibilityContext = createContext({
	isScreenReaderEnabled: false,
});
