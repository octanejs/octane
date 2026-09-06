import * as React from 'octane';
import { Autocomplete } from '@octanejs/base-ui/autocomplete';
import { Field } from '@octanejs/base-ui/field';
import { Form } from '@octanejs/base-ui/form';
import { Input } from '@octanejs/base-ui/input';
import { Switch } from '@octanejs/base-ui/switch';

export function AutocompleteRootServerCase1() {
	return <Form>
		<Field.Root name="search">
			<Autocomplete.Root items={['alpha', 'alpine']} inline>
				<Autocomplete.Input data-testid="input" />
				<Autocomplete.List>
					{(item) => <Autocomplete.Item key={item} value={item}>{item}</Autocomplete.Item>}
				</Autocomplete.List>
			</Autocomplete.Root>
		</Field.Root>
		<button type="submit">Submit</button>
	</Form>;
}

export function AutocompleteRootServerCase2() {
	return <Form>
		<Field.Root name="search">
			<Autocomplete.Root items={['alpha', 'alpine']}>
				<Autocomplete.InputGroup>
					<Autocomplete.Input data-testid="input" />
					<Autocomplete.Trigger>Open</Autocomplete.Trigger>
				</Autocomplete.InputGroup>
				<Autocomplete.Portal>
					<Autocomplete.Positioner>
						<Autocomplete.Popup>
							<Autocomplete.List>
								{(item) => <Autocomplete.Item key={item} value={item}>{item}</Autocomplete.Item>}
							</Autocomplete.List>
						</Autocomplete.Popup>
					</Autocomplete.Positioner>
				</Autocomplete.Portal>
			</Autocomplete.Root>
		</Field.Root>
		<button type="submit">Submit</button>
	</Form>;
}

export function AutocompleteRootServerCase3() {
	return <Form>
		<Field.Root name="search">
			<Autocomplete.Root items={['alpha', 'alpine']} defaultValue="alpha">
				<Autocomplete.Trigger>
					<Autocomplete.Value />
				</Autocomplete.Trigger>
				<Autocomplete.Portal>
					<Autocomplete.Positioner>
						<Autocomplete.Popup>
							<Autocomplete.Input render={<Input data-testid="input" />} />
							<Autocomplete.List>
								{(item) => <Autocomplete.Item key={item} value={item}>{item}</Autocomplete.Item>}
							</Autocomplete.List>
						</Autocomplete.Popup>
					</Autocomplete.Positioner>
				</Autocomplete.Portal>
			</Autocomplete.Root>
		</Field.Root>
		<button type="submit">Submit</button>
	</Form>;
}
