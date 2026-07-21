function useDiv(text) {
	return <div class="made">{text as string}</div>;
}
export function App(props) {
	if (props.disabled) return props.text;
	const div = useDiv(props.text);
	return div;
}
