/** @jsxImportSource octane */
import { TokenField, TreeSection } from '../src/components';

// These public props must remain accepted by consumers of the component exports.
// @ts-expect-error TreeSection items must be iterable, not an arbitrary DOM attribute.
const invalidTreeItems: Parameters<typeof TreeSection<{ id: string }>>[0]['items'] = 42;

export function PublicAriaComponentProps() {
	return (
		<>
			<TokenField
				aria-label="Tokens"
				autoFocus
				onFocus={() => {}}
				onBlur={() => {}}
				onFocusChange={() => {}}
			/>
			<TreeSection items={[{ id: 'recent' }]} />
		</>
	);
}
