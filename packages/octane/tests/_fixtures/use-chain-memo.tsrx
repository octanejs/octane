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

function ComputedPropChainReader(props: {
	'data-a': string;
	'data-b': string;
	load: (a: string, b: string) => Promise<string>;
}) @{
	const request = props.load(props['data-a'], props['data-b']);
	<p id="computed-prop-chain">{use(request) as string}</p>
}

export function ComputedPropChainHost(props: {
	'data-a': string;
	'data-b': string;
	load: (a: string, b: string) => Promise<string>;
}) @{
	@try {
		<ComputedPropChainReader data-a={props['data-a']} data-b={props['data-b']} load={props.load} />
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

function OptionalDerivedChainReader(props: {
	fetchUser: (id: string) => Promise<{ v: string }> | null;
	id: string;
}) @{
	const base = props.fetchUser(props.id);
	const derived = base?.then((value) => value.v);
	if (derived === undefined) throw new Error('fetchUser returned no promise');
	<p id="optional-derived-chain">{use(derived) as string}</p>
}

export function OptionalDerivedChainHost(props: {
	fetchUser: (id: string) => Promise<{ v: string }> | null;
	id: string;
}) @{
	@try {
		<OptionalDerivedChainReader fetchUser={props.fetchUser} id={props.id} />
	} @pending {
		<p>loading</p>
	}
}

// A chain const declared in an `else if` arm — the alternate is an
// IfStatement, not a block, and must still be reached by the taint pass.
function BranchReader({
	fetchUser,
	mode,
	id,
}: {
	fetchUser: (id: string) => Promise<string>;
	mode: string;
	id: string;
}) @{
	let label = 'none';
	if (mode === 'a') {
		label = 'a';
	} else if (mode === 'b') {
		const q = fetchUser(id);
		label = use(q);
	}
	<p>{'label=' + label}</p>
}

export function BranchChainHost({
	fetchUser,
	mode,
	id,
}: {
	fetchUser: (id: string) => Promise<string>;
	mode: string;
	id: string;
}) @{
	@try {
		<BranchReader fetchUser={fetchUser} mode={mode} id={id} />
	} @pending {
		<p>loading</p>
	}
}

function NestedBranchReader({
	fetchUser,
	inner,
	outer,
	id,
}: {
	fetchUser: (id: string) => Promise<string>;
	inner: boolean;
	outer: boolean;
	id: string;
}) @{
	let label = 'none';
	if (outer)
		if (inner) {
			const q = fetchUser(id);
			label = use(q);
		}
	<p>{'label=' + label}</p>
}

export function NestedBranchChainHost({
	fetchUser,
	inner,
	outer,
	id,
}: {
	fetchUser: (id: string) => Promise<string>;
	inner: boolean;
	outer: boolean;
	id: string;
}) @{
	@try {
		<NestedBranchReader fetchUser={fetchUser} inner={inner} outer={outer} id={id} />
	} @pending {
		<p>loading</p>
	}
}

function BracelessVarChainReader({
	fetchUser,
	id,
}: {
	fetchUser: (id: string) => Promise<{ v: string }>;
	id: string;
}) @{
	if (id !== '') var base = fetchUser(id);
	if (base === undefined) throw new Error('id is required');
	const derived = base.then((value) => value.v);
	<p>{'v=' + use(derived)}</p>
}

export function BracelessVarChainHost({
	fetchUser,
	id,
}: {
	fetchUser: (id: string) => Promise<{ v: string }>;
	id: string;
}) @{
	@try {
		<BracelessVarChainReader fetchUser={fetchUser} id={id} />
	} @pending {
		<p>loading</p>
	}
}

// A setup block shadows `item` and use()s the inner binding; the unrelated
// outer `const item = build()` must keep recreating per render (name-based
// tainting must not freeze it).
export function SetupShadowHost({
	log,
	build,
	fetchThing,
	id,
}: {
	log: (entry: string) => void;
	build: () => { n: number };
	fetchThing: (id: string) => Promise<string>;
	id: string;
}) @{
	const [tick, setTick] = useState(0);
	const item = build();
	log('built:' + item.n);
	let label = 't' + tick;
	{
		const item = fetchThing(id);
		label = label + ':' + use(item);
	}
	<div>
		<button id="tick" onClick={() => setTick(tick + 1)}>t</button>
		{'l=' + label}
	</div>
}

// A @for arm binds its own `item`; use(item.promise) must NOT taint the
// unrelated same-named body const into memoization — `build()` re-runs every
// render exactly as an unmemoized creation should.
export function ShadowedLoopHost({
	log,
	build,
	rows,
}: {
	log: (entry: string) => void;
	build: () => { n: number };
	rows: { id: number; promise: Promise<string> }[];
}) @{
	const [tick, setTick] = useState(0);
	const item = build();
	log('built:' + item.n);
	<div>
		<button id="tick" onClick={() => setTick(tick + 1)}>t</button>
		<span>{'t=' + tick}</span>
		@for (const item of rows; key item.id) {
			<p>{'v=' + use(item.promise)}</p>
		}
	</div>
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
