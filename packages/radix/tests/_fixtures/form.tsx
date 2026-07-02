import { Form } from '@octanejs/radix';

export function FormApp() {
	return (
		<div data-testid="app">
			<Form.Root data-testid="form">
				<Form.Field data-testid="field" name="email">
					<Form.Label data-testid="label">Email</Form.Label>
					<Form.Control data-testid="control" type="email" required />
					<Form.Message data-testid="msg-missing" match="valueMissing">
						Please enter your email
					</Form.Message>
					<Form.Message
						data-testid="msg-taken"
						match={(value: string) => value === 'taken@example.com'}
					>
						Email already taken
					</Form.Message>
				</Form.Field>
				<Form.Submit data-testid="submit">Submit</Form.Submit>
			</Form.Root>
		</div>
	);
}
