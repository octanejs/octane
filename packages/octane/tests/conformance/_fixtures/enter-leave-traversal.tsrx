// Fixture for tests/conformance/enter-leave-traversal.test.ts — the octane port
// of react-dom/src/__tests__/ReactTreeTraversal-test.js (React 19.2.7).
//
// Mirrors that file's ParentComponent/ChildComponent tree exactly (same ids):
//
//   P
//   ├─ P_P1
//   │   ├─ P_P1_C1__DIV  ├─ __DIV_1  ├─ __DIV_2
//   │   └─ P_P1_C2__DIV  ├─ __DIV_1  ├─ __DIV_2
//   └─ P_OneOff
//
// Every node logs `<id> captured|bubbled <type>` for click and `<id> <type>`
// for the enter/leave family, through the `handler` prop.

const h = (handler: (s: string) => void) => ({
	onClickCapture: (e: any) => handler(e.currentTarget.id + ' captured ' + e.type),
	onClick: (e: any) => handler(e.currentTarget.id + ' bubbled ' + e.type),
	onMouseEnter: (e: any) => handler(e.currentTarget.id + ' ' + e.type),
	onMouseLeave: (e: any) => handler(e.currentTarget.id + ' ' + e.type),
	onPointerEnter: (e: any) => handler(e.currentTarget.id + ' ' + e.type),
	onPointerLeave: (e: any) => handler(e.currentTarget.id + ' ' + e.type),
});

function Child(props: { id: string; handler: (s: string) => void }) @{
	<div id={props.id + '__DIV'} {...h(props.handler)}>
		<div id={props.id + '__DIV_1'} {...h(props.handler)}></div>
		<div id={props.id + '__DIV_2'} {...h(props.handler)}></div>
	</div>
}

export function TraversalTree(props: { handler: (s: string) => void }) @{
	<div id="P" {...h(props.handler)}>
		<div id="P_P1" {...h(props.handler)}>
			<Child id="P_P1_C1" handler={props.handler} />
			<Child id="P_P1_C2" handler={props.handler} />
		</div>
		<div id="P_OneOff" {...h(props.handler)}></div>
	</div>
}
