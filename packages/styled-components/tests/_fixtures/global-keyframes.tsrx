import { useState } from 'octane';
import { keyframes, styled } from '@octanejs/styled-components';

const slide = keyframes`
  from { transform: translateX(0); }
  to { transform: translateX(10px); }
`;

// Dynamic letter-spacing lives on the styled element (not createGlobalStyle) so
// widen changes both the container class list and each engine's isolated
// `style[data-styled]` sheet. createGlobalStyle-only updates leave the
// container unchanged and are covered by Octane conformance tests instead.
const Mover = styled.div`
  animation: ${slide} 2s infinite;
  letter-spacing: ${(p: any) => (p.$wide
	? '4px'
	: '1px')};
`;

export function GlobalKeyframes() @{
	const [wide, setWide] = useState(false);
	<div>
		<Mover id="mover" $wide={wide}>
			moving
		</Mover>
		<button id="widen" onClick={() => setWide(true)}>
			widen
		</button>
	</div>
}
