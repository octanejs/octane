// Ported from react-hot-toast@2.6.1 src/components/loader.tsx
// (https://github.com/timolins/react-hot-toast/tree/v2.6.1).
//
// Octane adaptations: goober's styled('div') becomes styledDiv, and templates
// carry the published build's collapsed whitespace (see styled.tsrx).
import { keyframes } from '../goober.js';
import { styledDiv } from './styled.tsrx';

const rotate = keyframes` from { transform: rotate(0deg); } to { transform: rotate(360deg); } `;

export interface LoaderTheme {
	primary?: string;
	secondary?: string;
}

export const LoaderIcon = styledDiv<LoaderTheme>` width: 12px; height: 12px; box-sizing: border-box; border: 2px solid; border-radius: 100%; border-color: ${(p) => p.secondary || '#e0e0e0'}; border-right-color: ${(p) => p.primary || '#616161'}; animation: ${rotate} 1s linear infinite; `;
