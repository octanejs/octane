import { useId } from '../../src/useId';

export function IdFixture({ id: idProp }: { id?: string }) @{
	const id = useId(idProp);
	<span data-testid="target" id={id} />
}
