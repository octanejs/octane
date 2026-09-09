import { createContext, use } from 'octane';

const RootCtx = createContext(0);
const OtherCtx = createContext(0);

export const ROW_IDS = Array.from({ length: 512 }, (_, index) => index);

function ZeroRow(props) @{
	<span class="cache-row" data-id={props.id}>{props.id + '|' + props.version +
		':0' as string}</span>
}

function OneRow(props) @{
	const root = use(RootCtx);
	<span class="cache-row" data-id={props.id}>{props.id + '|' + root + ':0' as string}</span>
}

function TwoRow(props) @{
	const root = use(RootCtx);
	const other = use(OtherCtx);
	<span class="cache-row" data-id={props.id}>{props.id + '|' + root + ':' + other as string}</span>
}

const ROWS = { zero: ZeroRow, one: OneRow, two: TwoRow };

export default function ContextCache(props) @{
	const Row = ROWS[props.mode];
	<RootCtx.Provider value={props.version}>
		<OtherCtx.Provider value={props.secondary}>
			<div class="cache-rows">
				@for (const id of props.ids; key id) {
					<Row id={id} version={props.version} />
				}
			</div>
		</OtherCtx.Provider>
	</RootCtx.Provider>
}
