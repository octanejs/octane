import { use, useState } from 'octane';

// The setup-const promise-chain shape from docs/decallback-memo.md (Pass A′):
// creations assigned to locals and fed to use() as trivial identifier
// arguments. Without the taint pass every render and every suspend-replay
// re-runs `fetchUser` (the replay leniency drops the fresh promise but the
// duplicate request already fired).

function ChainReader({
	fetchUser,
	id,
}: {
	fetchUser: (id: string) => Promise<{ thumb: string }>;
	id: string;
}) @{
	const userPromise = fetchUser(id);
	const thumbPromise = userPromise.then((user) => user.thumb);
	<p>{'thumb=' + use(thumbPromise)}</p>
}

// The verbatim originating shape: chain consts in setup, use() at COMPONENT
// PROP position (not a text hole) — the taint scan must find the consumer
// inside the render tree's prop expression.
function ThumbnailRenderer({ thumbnail }: { thumbnail: string }) @{
	<img src={thumbnail} />
}

function PropChainReader({
	fetchUser,
	id,
}: {
	fetchUser: (id: string) => Promise<{ thumbnail: () => Promise<string> }>;
	id: string;
}) @{
	const userPromise = fetchUser(id);
	const thumbnailPromise = userPromise.then((user) => user.thumbnail());
	<ThumbnailRenderer thumbnail={use(thumbnailPromise)} />
}

export function PropChainHost({
	fetchUser,
	id,
}: {
	fetchUser: (id: string) => Promise<{ thumbnail: () => Promise<string> }>;
	id: string;
}) @{
	@try {
		<PropChainReader fetchUser={fetchUser} id={id} />
	} @pending {
		<p>loading</p>
	}
}

function SwitchingChainReader({
	fetchA,
	fetchB,
	useB,
	id,
}: {
	fetchA: (id: string) => Promise<{ v: string }>;
	fetchB: (id: string) => Promise<{ v: string }>;
	useB: boolean;
	id: string;
}) @{
	let base = fetchA(id);
	if (useB) {
		base = fetchB(id);
	}
	const derived = base.then((x) => x.v);
	<p>{'v=' + use(derived)}</p>
}

export function SwitchingChainHost({
	fetchA,
	fetchB,
	useB,
	id,
}: {
	fetchA: (id: string) => Promise<{ v: string }>;
	fetchB: (id: string) => Promise<{ v: string }>;
	useB: boolean;
	id: string;
}) @{
	@try {
		<SwitchingChainReader fetchA={fetchA} fetchB={fetchB} useB={useB} id={id} />
	} @pending {
		<p>loading</p>
	}
}

export function ChainHost({
	fetchUser,
	id,
}: {
	fetchUser: (id: string) => Promise<{ thumb: string }>;
	id: string;
}) @{
	const [tick, setTick] = useState(0);
	<div>
		<button id="tick" onClick={() => setTick(tick + 1)}>t</button>
		<span>{'tick=' + tick}</span>
		@try {
			<ChainReader fetchUser={fetchUser} id={id} />
		} @pending {
			<p>loading</p>
		}
	</div>
}
