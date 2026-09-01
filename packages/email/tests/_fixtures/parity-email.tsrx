import { Body, Button, Container, Head, Heading, Html, Text } from '../../src/components.tsrx';

export function ParityEmail(props: { name: string }) @{
	<Html lang="en">
		<Head />
		<Body style={{ backgroundColor: '#f6f9fc', margin: 0 }}>
			<Container style={{ padding: '20px', backgroundColor: '#ffffff' }}>
				<Heading as="h2">Welcome</Heading>
				<Text>Hello, {props.name as string}</Text>
				<Button
					href="https://example.com"
					style={{ backgroundColor: '#000', color: '#fff', padding: '12px 20px' }}
				>Get started</Button>
			</Container>
		</Body>
	</Html>
}

export function TextMarginsEmail() @{
	<Html>
		<Head />
		<Body>
			<Text style={{ margin: 0 }}>No margins</Text>
			<Text style={{ margin: 0, marginTop: '8px' }}>Top margin override</Text>
		</Body>
	</Html>
}
