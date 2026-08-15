// A single custom hook reached two ways — as a bare identifier and as an object
// property — so the component-boundary contract can be compared across the two
// call shapes with nothing else varying.
import { useEffect, useState } from 'octane';

export const log: string[] = [];

const bumpers: Array<() => void> = [];

export function bumpFirst(): void {
	bumpers[0]?.();
}

export function resetFixture(): void {
	bumpers.length = 0;
	log.length = 0;
}

export function useCounter(): number {
	const [n, setN] = useState(0);

	useEffect(() => {
		const bump = () => setN((value) => value + 1);
		bumpers.push(bump);
		return () => {
			const index = bumpers.indexOf(bump);
			if (index >= 0) bumpers.splice(index, 1);
		};
	}, []);

	return n;
}

// The same hook, carried on an object — the shape React-ecosystem libraries use
// for `route.useLoaderData()`, `api.useGetThingQuery()`, and the hooks returned
// by a `createXContext()` factory.
export const api = { useCounter };

export function MemberHookChild() @{
	const n = api.useCounter();

	log.push('MemberHookChild:' + n);

	<span id="member">{n as string}</span>
}

export function IdentifierHookChild() @{
	const n = useCounter();

	log.push('IdentifierHookChild:' + n);

	<span id="identifier">{n as string}</span>
}

export function HooklessSibling() @{
	log.push('HooklessSibling');

	<span id="sibling">sibling</span>
}

export function MemberParent() @{
	log.push('MemberParent');

	<div>
		<MemberHookChild />
		<HooklessSibling />
	</div>
}

export function IdentifierParent() @{
	log.push('IdentifierParent');

	<div>
		<IdentifierHookChild />
		<HooklessSibling />
	</div>
}
