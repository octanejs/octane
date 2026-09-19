import { createContext, type OctaneNode } from 'octane';

export const ImportedTheme = createContext('default');

export function WithheldChildren(_props: { value: string; children?: OctaneNode }) {
	return null;
}
