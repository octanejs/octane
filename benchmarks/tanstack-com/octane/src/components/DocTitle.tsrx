export function DocTitle(props: { children?: any }) {
	return <>
		<h1
			class={`flex gap-4 items-center flex-wrap text-xl md:text-2xl font-black`}
		>{props.children}</h1>
	</>;
}
