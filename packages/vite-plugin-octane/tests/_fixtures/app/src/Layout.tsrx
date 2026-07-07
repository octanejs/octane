export default function Layout(props: { children: unknown }) @{
	<div class="shell">
		<nav>{'fixture-nav'}</nav>
		{props.children}
	</div>
}
