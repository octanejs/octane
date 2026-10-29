// Ported from react-hot-toast@2.6.1 src/components/checkmark.tsx
// (https://github.com/timolins/react-hot-toast/tree/v2.6.1).
//
// Octane adaptations: goober's styled('div') becomes styledDiv, and templates
// carry the published build's collapsed whitespace (see styled.tsrx).
import { keyframes } from '../goober.js';
import { styledDiv } from './styled.tsrx';

const circleAnimation = keyframes` from { transform: scale(0) rotate(45deg); opacity: 0; } to { transform: scale(1) rotate(45deg); opacity: 1; }`;

const checkmarkAnimation = keyframes` 0% { height: 0; width: 0; opacity: 0; } 40% { height: 0; width: 6px; opacity: 1; } 100% { opacity: 1; height: 10px; }`;

export interface CheckmarkTheme {
	primary?: string;
	secondary?: string;
}

export const CheckmarkIcon = styledDiv<CheckmarkTheme>` width: 20px; opacity: 0; height: 20px; border-radius: 10px; background: ${(p) => p.primary || '#61d345'}; position: relative; transform: rotate(45deg); animation: ${circleAnimation} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; animation-delay: 100ms; &:after { content: ''; box-sizing: border-box; animation: ${checkmarkAnimation} 0.2s ease-out forwards; opacity: 0; animation-delay: 200ms; position: absolute; border-right: 2px solid; border-bottom: 2px solid; border-color: ${(p) => p.secondary || '#fff'}; bottom: 6px; left: 6px; height: 10px; width: 6px; } `;
