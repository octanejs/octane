import { use, type OctaneNode } from 'octane';

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
