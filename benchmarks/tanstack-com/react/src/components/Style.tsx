export function Style({ children }: { children: string }) {
	return (
		<style
			dangerouslySetInnerHTML={{
				__html: children,
			}}
		/>
	);
}
