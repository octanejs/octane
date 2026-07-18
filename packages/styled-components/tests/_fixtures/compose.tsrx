import { useState } from 'octane';
import styled, { css } from '@octanejs/styled-components';

const Chip = styled.span`
  padding: 2px;
`;

const Base = styled.button`
  color: ${(p: any) => (p.$tone === 'hot'
	? 'orangered'
	: 'dimgray')};
  ${(p: any) => p.$tone === 'hot' && css`
      border: 1px solid orangered;
    `}
`;

const Fancy = styled(Base)`
  font-style: italic;
  ${Chip} {
    margin-left: 4px;
  }
`;

export function Compose() @{
	const [tone, setTone] = useState('mild');
	<div>
		<Fancy id="fancy" $tone={tone} onClick={() => setTone('hot')}>
			Compose
			<Chip id="chip">7</Chip>
		</Fancy>
	</div>
}
