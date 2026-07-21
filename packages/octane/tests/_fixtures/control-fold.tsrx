import { Activity, Fragment, createContext, createElement, use, useState } from 'octane';

// return-JSX form: a host element containing `@if` — folds to the return-based
// fragment model (the branch helpers stay in the component for their closure; the
// condition + helpers thread into the renderer as `props.hN` holes).
export function RetToggle(props) {
	const [n, setN] = useState(0);
	return <div>
		@if (props.on) {
			<button id="hit" onClick={() => setN(n + 1)}>{'on:' + n}</button>
		} @else {
			<span class="off">off</span>
		}
	</div>;
}

// `@{}` oracle — the inline form. Must produce byte-identical DOM to the folded
// return-JSX form above (and update identically), which is the fold's contract.
export function AtToggle(props) @{
	const [n, setN] = useState(0);
	<div>
		@if (props.on) {
			<button id="hit" onClick={() => setN(n + 1)}>{'on:' + n}</button>
		} @else {
			<span class="off">off</span>
		}
	</div>
}

// Product-style return fragment: the toolbar is a fixed sibling while a
// top-level @if selects a mailbox view, whose drafts arm owns a keyed @for.
// Directives need template Block scopes even though the outer component uses
// React-style `return <>...</>` authoring.
export function ReturnedMailbox(props) {
	const [folder, setFolder] = useState('drafts');
	return <>
		<button id="folder-toggle" onClick={() => setFolder(folder === 'drafts' ? 'sent' : 'drafts')}>
			{'Show ' + (folder === 'drafts' ? 'sent' : 'drafts')}
		</button>
		@if (folder === 'drafts') {
			<section id="drafts">
				<h2>Saved drafts</h2>
				@for (const draft of props.drafts; key draft.id) {
					<article class="draft" data-id={draft.id as string}>{draft.subject as string}</article>
				} @empty {
					<p id="empty-drafts">No saved drafts</p>
				}
			</section>
		} @else {
			<section id="sent">
				<h2>Sent mail</h2>
			</section>
		}
	</>;
}

function DeliverySummary(props) {
	if (props.failed) throw new Error('summary unavailable');
	return <p id="delivery-summary">{'Ready: ' + props.total}</p>;
}

// Multiple root directives share the same returned-fragment renderer. This
// resembles a dashboard with an independent folder summary, delivery event
// list, and error-contained aggregate rather than a directive-only toy.
export function ReturnedDashboard(props) {
	return <>
		<h2 id="dashboard-title">Delivery dashboard</h2>
		@switch (props.folder) {
			@case 'inbox': {
				<p id="folder-summary">Inbox activity</p>
			}
			@case 'sent': {
				<p id="folder-summary">Sent activity</p>
			}
			@default: {
				<p id="folder-summary">Other activity</p>
			}
		}
		@for (const event of props.events; key event.id) {
			<article class="delivery-event" data-id={event.id as string}>{event.label as string}</article>
		} @empty {
			<p id="empty-events">No delivery events</p>
		}

		@try {
			<DeliverySummary failed={props.failed} total={props.events.length as number} />
		} @catch (error) {
			<p id="summary-error">Summary unavailable</p>
		}
	</>;
}

const MailboxContext = createContext('unknown');

function CurrentMailbox() {
	const mailbox = use(MailboxContext);
	return <strong id="current-mailbox">{'Current: ' + mailbox}</strong>;
}

// Component children are still template authoring: a Provider inside the
// returned fragment must receive its @if children rather than a descriptor
// conversion silently discarding them.
export function ReturnedProviderMailbox(props) {
	return <>
		<h2 id="provider-title">Mailbox context</h2>
		<MailboxContext.Provider value={props.folder}>
			@if (props.show) {
				<CurrentMailbox />
			} @else {
				<span id="no-mailbox">No mailbox selected</span>
			}
		</MailboxContext.Provider>
	</>;
}

export function EvaluationPanel(props) {
	return <section
		id="evaluation-panel"
		data-label={props.label as string}
	>{props.children}</section>;
}

// A member component nested in a returned fragment keeps its directive children
// in template position. Its tag getter must still run before the authored prop
// and child expressions, matching ordinary JSX evaluation order.
export function ReturnedMemberEvaluationOrder(props) {
	return <>
		<props.widgets.Panel label={props.observe('prop')}>
			@if (props.observe('condition')) {
				<span id="evaluation-child">Condition active</span>
			} @else {
				<span id="evaluation-child">Condition inactive</span>
			}
		</props.widgets.Panel>
	</>;
}

function ActivityDraft(props) {
	const [edits, setEdits] = useState(0);
	return <button id={props.id} onClick={() => setEdits((count) => count + 1)}>{props.prefix +
		edits as string}</button>;
}

// Activity is compiler-owned template control flow, even when it is the only
// control-flow form inside a React-style returned fragment.
export function ReturnedActivityMailbox(props) {
	return <>
		<h2 id="activity-title">Focused draft</h2>
		<Activity mode={props.mode}>
			<ActivityDraft id="activity-draft" prefix="Draft edits: " />
		</Activity>
		<span id="activity-tail">Mailbox ready</span>
	</>;
}

// A direct returned Activity is the render output itself. Multiple children make
// its range ownership observable, while observe() pins normal attribute-before-
// child expression evaluation.
export function DirectReturnedActivityMailbox(props) {
	return <Activity mode={props.observe('mode', props.mode)}>
		<h2 id="direct-activity-title">Direct focused draft</h2>
		<ActivityDraft id="direct-activity-draft" prefix="Direct edits: " />
		<span id="direct-activity-tail">{props.observe(
			'child',
			'Direct mailbox ready',
		) as string}</span>
	</Activity>;
}

// Head singletons nested in a React-style returned fragment still belong to the
// document-head channel. Dynamic values make update/adoption behavior observable.
export function ReturnedHeadMailbox(props) {
	return <>
		<title data-returned-fragment-head="title">{props.title as string}</title>
		<meta
			name="returned-fragment-description"
			content={props.description}
			data-returned-fragment-head="meta"
		/>
		<link rel="canonical" href={props.canonical} data-returned-fragment-head="link" />
		<main id="head-mailbox">{props.body as string}</main>
	</>;
}

export function DirectReturnedTitle(props) {
	return <title data-direct-returned-head="title">{props.title as string}</title>;
}

export function DirectReturnedMeta(props) {
	return <meta
		name="direct-returned-description"
		content={props.description}
		data-direct-returned-head="meta"
	/>;
}

export function DirectReturnedLink(props) {
	return <link rel="canonical" href={props.canonical} data-direct-returned-head="link" />;
}

// An ordinary keyed Fragment is a runtime descriptor boundary, not compiler-only
// template syntax. Changing its key must remount the stateful child.
export function ReturnedKeyedFragmentBoundary(props) {
	return <>
		<Fragment key={props.fragmentKey}>
			<ActivityDraft id="keyed-fragment-draft" prefix="Keyed edits: " />
		</Fragment>
	</>;
}

export function DirectReturnedKeyedFragmentBoundary(props) {
	return <Fragment key={props.fragmentKey}>
		<ActivityDraft id="direct-keyed-fragment-draft" prefix="Direct keyed edits: " />
	</Fragment>;
}

// Public createElement may place a keyed Fragment among a de-opt host's other
// descriptor children. The Fragment is transparent markup, but it remains a
// list boundary whose leaves must line up with the client hydration ranges.
export function DescriptorHostWithKeyedFragment() {
	return createElement(
		'div',
		{ id: 'descriptor-fragment-host' },
		createElement('span', { id: 'descriptor-before', key: 'before' }, 'Before'),
		createElement(
			Fragment,
			{ key: 'group' },
			createElement('button', { id: 'descriptor-a', key: 'a' }, 'A'),
			createElement('button', { id: 'descriptor-b', key: 'b' }, 'B'),
		),
		createElement('span', { id: 'descriptor-after', key: 'after' }, 'After'),
	);
}

function DescriptorComponentLeaf(props) {
	return <button id={props.id}>{props.label as string}</button>;
}

export function DescriptorHostWithKeyedComponents() {
	return createElement(
		'div',
		{ id: 'descriptor-component-host' },
		createElement(DescriptorComponentLeaf, {
			id: 'descriptor-component-a',
			key: 'a',
			label: 'A',
		}),
		createElement(DescriptorComponentLeaf, {
			id: 'descriptor-component-b',
			key: 'b',
			label: 'B',
		}),
	);
}

// A render-only child `@{...}` is template syntax, not a value child. It must
// survive the returned-fragment extraction and remain interactive and reactive.
export function ReturnedChildCodeBlock(props) {
	return <>
		<h2 id="child-code-block-title">Quick action</h2>
		@{
			<button id="child-code-block-action" onClick={props.onAction}>{props.label as string}</button>
		}
	</>;
}
