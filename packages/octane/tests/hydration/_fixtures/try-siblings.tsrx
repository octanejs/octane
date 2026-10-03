import { ErrorBoundary, use, type OctaneNode } from 'octane';

function Box({ children }: { children: OctaneNode }) @{
	<div>{children}</div>
}

function Item({ name, choose }: { name: string; choose?: (name: string) => void }) @{
	<button onClick={() => choose?.(name)}>{name as string}</button>
}

function Choice({ fail, gate }: { fail: boolean; gate?: Promise<void> }) @{
	if (fail) throw new Error('synthetic client failure');
	if (gate !== undefined) use(gate);
	<Item name="inside" />
}

export function App({
	fail,
	gate,
	choose,
}: {
	fail: boolean;
	gate?: Promise<void>;
	choose?: (name: string) => void;
}) @{
	<Box>
		<Item name="before" choose={choose} />
		@try {
			<Choice fail={fail} gate={gate} />
		} @pending {
			<Item name="loading" />
		} @catch (_error) {
			<Item name="error" />
		}
		<Item name="after" choose={choose} />
		<Item name="last" choose={choose} />
	</Box>
}

function Pair({ name }: { name: string }) @{
	<>
		<i>{name as string}</i>
		<s>{'s'}</s>
	</>
}

// Neither body has a template, so the component after the boundary finds its
// server range where the boundary leaves the hydration cursor.
function TryPair({ fail }: { fail: boolean }) @{
	<>
		@try {
			<Choice fail={fail} />
		} @catch (_error) {
			<Item name="error" />
		}
		<Pair name="pair" />
	</>
}

function BoundaryPair({ fail }: { fail: boolean }) @{
	<>
		<ErrorBoundary fallback={<Item name="error" />}>
			<Choice fail={fail} />
		</ErrorBoundary>
		<Pair name="pair" />
	</>
}

export function TryThenPair({ fail }: { fail: boolean }) @{
	<section>
		<TryPair fail={fail} />
		<Item name="after" />
	</section>
}

export function BoundaryThenPair({ fail }: { fail: boolean }) @{
	<section>
		<BoundaryPair fail={fail} />
		<Item name="after" />
	</section>
}
