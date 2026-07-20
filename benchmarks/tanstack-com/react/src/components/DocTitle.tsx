export function DocTitle(props: { children: React.ReactNode }) {
	return (
		<>
			<h1 className={`flex gap-4 items-center flex-wrap text-xl md:text-2xl font-black`}>
				{props.children}
			</h1>
		</>
	);
}
