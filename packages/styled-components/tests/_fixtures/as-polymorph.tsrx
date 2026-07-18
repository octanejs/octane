import { useState } from 'octane';
import styled from '@octanejs/styled-components';

const Poly = styled.button`
  color: firebrick;
`;

export function AsPolymorph() @{
	const [asLink, setAsLink] = useState(false);
	<div>
		<Poly id="poly" as={asLink ? 'a' : undefined} href={asLink ? '#dest' : undefined}>
			Target
		</Poly>
		<button id="swap" onClick={() => setAsLink(true)}>
			swap
		</button>
	</div>
}
