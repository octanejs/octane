import { useState } from 'octane';
import { createGlobalStyle, keyframes, styled } from '@octanejs/styled-components';

const slide = keyframes`
  from { transform: translateX(0); }
  to { transform: translateX(10px); }
`;

const Global = createGlobalStyle`
  body { letter-spacing: ${(p: any) => (p.$wide
	? '4px'
	: '1px')}; }
`;

const Mover = styled.div`
  animation: ${slide} 2s infinite;
`;

export function GlobalKeyframes() @{
	const [wide, setWide] = useState(false);
	<div>
		<Global $wide={wide} />
		<Mover id="mover">moving</Mover>
		<button id="widen" onClick={() => setWide(true)}>
			widen
		</button>
	</div>
}
