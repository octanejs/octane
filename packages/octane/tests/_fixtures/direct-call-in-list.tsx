/** @jsxImportSource octane */
export function StampRow(props: { label: string }) {
	if (props.label === '') return <li className="stamp empty">(empty)</li>;
	return <li className="stamp">{props.label}</li>;
}
export function StampList(props: { labels: string[] }) {
	return <ul className="stamps">{props.labels.map((label) => StampRow({ label }))}</ul>;
}
export function StampSingle(props: { label: string }) {
	return <ul className="stamps">{StampRow({ label: props.label })}</ul>;
}
