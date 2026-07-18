import { useState } from 'octane';
import styled from '@octanejs/styled-components';

const Title = styled.h1`
  color: red;
`;

const Button = styled.button`
  color: ${(props) => (props.$variant === 'primary'
	? 'blue'
	: 'gray')};
`;

export function SmokeApp() @{
	const [variant, setVariant] = useState('default');
	<div>
		<Title id="title">Hello</Title>
		<Button id="btn" $variant={variant} onClick={() => setVariant('primary')}>
			Go
		</Button>
	</div>
}
