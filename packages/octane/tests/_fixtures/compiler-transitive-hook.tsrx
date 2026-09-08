import { usePair } from './compiler-transitive-hook';

export function Pair() @{
	const [first, second] = usePair();
	<div>
		<button onClick={() => first[1]('updated')}>{first[0] as string}</button>
		<output>{second[0] as string}</output>
	</div>
}
