import { Fragment, createPortal, type FragmentInstance } from 'octane';

type FragmentReference = { current: FragmentInstance | null };

export function LedgerNestedFocus(props: { fragmentRef: FragmentReference }) @{
	<main id="ledger-focus-host">
		<Fragment ref={props.fragmentRef}>
			<div id="ledger-focus-wrapper">
				<div id="ledger-focus-first" tabIndex={0}>
					<a id="ledger-focus-first-nested" href="/">{'first nested'}</a>
				</div>
			</div>
			<div id="ledger-focus-last-parent" tabIndex={0}>
				<a id="ledger-focus-last-before" href="/">{'before last'}</a>
				<a id="ledger-focus-last-nested" href="/">{'last nested'}</a>
			</div>
		</Fragment>
	</main>
}

export function LedgerDynamicFocus(props: {
	fragmentRef: FragmentReference;
	showFirst: boolean;
	showSecond: boolean;
}) @{
	<main id="ledger-dynamic-focus-host">
		<Fragment ref={props.fragmentRef}>
			@if (props.showFirst) {
				<a id="ledger-dynamic-first" href="/">{'first'}</a>
			}
			@if (props.showSecond) {
				<a id="ledger-dynamic-second" href="/">{'second'}</a>
			}
		</Fragment>
	</main>
}

export function LedgerRootPositions(props: {
	fragmentRef: FragmentReference;
	emptyRef: FragmentReference;
}) @{
	<Fragment>
		<button id="ledger-root-before" type="button">{'before'}</button>
		<Fragment ref={props.fragmentRef}>
			<button id="ledger-root-child" type="button">{'child'}</button>
		</Fragment>
		<Fragment ref={props.emptyRef}></Fragment>
		<button id="ledger-root-after" type="button">{'after'}</button>
	</Fragment>
}

export function LedgerRemovableFragment(props: {
	fragmentRef: FragmentReference;
	mounted: boolean;
}) @{
	<main id="ledger-removable-parent">
		@if (props.mounted) {
			<Fragment ref={props.fragmentRef}>
				<button id="ledger-removable-child" type="button">{'child'}</button>
			</Fragment>
		}
	</main>
}

export function LedgerPortaledEmptyFragment(props: {
	fragmentRef: FragmentReference;
	target: Element;
}) @{
	<main id="ledger-empty-portal-source">
		<button id="ledger-empty-before" type="button">{'before'}</button>
		{createPortal(<Fragment ref={props.fragmentRef}></Fragment>, props.target)}
		<button id="ledger-empty-after" type="button">{'after'}</button>
	</main>
}

export function LedgerPortalScrollContainers(props: {
	fragmentRef: FragmentReference;
	firstTarget: Element;
	secondTarget: Element;
}) @{
	<main id="ledger-portal-scroll-source">
		{createPortal(
			<button id="ledger-portal-outside" type="button">{'outside'}</button>,
			props.secondTarget,
		)}
		<Fragment ref={props.fragmentRef}>
			{createPortal(
				<button id="ledger-portal-first" type="button">{'first'}</button>,
				props.firstTarget,
			)}
			{createPortal(
				<button id="ledger-portal-second" type="button">{'second'}</button>,
				props.secondTarget,
			)}
			{createPortal(
				<button id="ledger-portal-third" type="button">{'third'}</button>,
				props.secondTarget,
			)}
		</Fragment>
	</main>
}

export function LedgerInterleavedPortals(props: {
	fragmentRef: FragmentReference;
	target: Element;
	showLate: boolean;
}) @{
	<Fragment>
		<button id="ledger-shared-source-before" type="button">{'source before'}</button>
		{createPortal(
			<Fragment ref={props.fragmentRef}>
				<button id="ledger-shared-first" type="button">{'first'}</button>
				@if (props.showLate) {
					<div id="ledger-shared-late">
						<button id="ledger-shared-nested" type="button">{'nested'}</button>
					</div>
				}
			</Fragment>,
			props.target,
		)}
		{createPortal(
			<button id="ledger-shared-outside" type="button">{'outside'}</button>,
			props.target,
		)}
		<button id="ledger-shared-source-after" type="button">{'source after'}</button>
	</Fragment>
}
