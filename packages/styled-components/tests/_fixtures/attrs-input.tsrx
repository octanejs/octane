import { useState } from 'octane';
import styled from '@octanejs/styled-components';

const Field = styled.input.attrs(
	(p: any) => ({
		type: 'text',
		placeholder: p.$hint ?? 'type here',
		'data-tone': p.$tone,
	}),
)`
  border-color: ${(p: any) => (p.$tone === 'danger' ? 'red' : 'silver')};
`;

const Filtered = styled.button.withConfig({
	shouldForwardProp: (prop) => prop !== 'loud',
})`
  text-transform: ${(p: any) => (p.loud ? 'uppercase' : 'none')};
`;

export function AttrsInput() @{
	const [tone, setTone] = useState('calm');
	<div>
		<Field id="field" $tone={tone} $hint="name" />
		<Filtered id="filter-btn" loud={tone === 'danger'} onClick={() => setTone('danger')}>
			Escalate
		</Filtered>
	</div>
}
