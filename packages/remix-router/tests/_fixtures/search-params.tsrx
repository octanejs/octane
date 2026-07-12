import { MemoryRouter, Route, Routes, useSearchParams } from '@octanejs/remix-router';

// useSearchParams fixture — read, defaultInit merge, object/function setters.

function SearchPage(props: { defaultInit?: any }) @{
	const [searchParams, setSearchParams] = useSearchParams(props.defaultInit);
	<div>
		<p id="q">
			{'q=' + (searchParams.get('q') ?? '(none)')}
		</p>
		<p id="page">
			{'page=' + (searchParams.get('page') ?? '(none)')}
		</p>
		<button id="set-obj" onClick={() => setSearchParams({ q: 'octane' })}>set-obj</button>
		<button
			id="set-fn"
			onClick={() => setSearchParams((prev) => {
				prev.set('page', String(Number(prev.get('page') ?? '0') + 1));
				return prev;
			})}
		>
			set-fn
		</button>
		<button id="clear" onClick={() => setSearchParams({})}>clear</button>
	</div>
}

export function SearchParamsApp(props: { initial?: string; defaultInit?: any }) @{
	<MemoryRouter initialEntries={[props.initial ?? '/']}>
		<Routes>
			<Route path="/" element={<SearchPage defaultInit={props.defaultInit} />} />
		</Routes>
	</MemoryRouter>
}
