/** @jsxImportSource octane */
import * as Octane from 'octane';
import { Fragment as Group, type FragmentInstance } from 'octane';

type FragmentReference = { current: FragmentInstance | null };

export function AutomaticJsxAliasedFragmentRef(props: { fragRef: FragmentReference }) {
	return (
		<section id="tsx-alias-parent">
			<Group ref={props.fragRef}>
				<button id="tsx-alias-child">automatic alias</button>
			</Group>
		</section>
	);
}

export function AutomaticJsxNamespacedFragmentRef(props: { fragRef: FragmentReference }) {
	return (
		<section id="tsx-namespace-parent">
			<Octane.Fragment ref={props.fragRef}>
				<button id="tsx-namespace-child">automatic namespace</button>
			</Octane.Fragment>
		</section>
	);
}

export function AutomaticJsxSpreadFragmentRef(props: {
	spread: { ref?: FragmentReference | null };
}) {
	return (
		<section id="tsx-spread-parent">
			<Group {...props.spread}>
				<button id="tsx-spread-child">automatic spread</button>
			</Group>
		</section>
	);
}

export function AutomaticJsxNamespacedSpreadFragmentRef(props: {
	spread: { ref?: FragmentReference | null };
}) {
	return (
		<section id="tsx-spread-namespace-parent">
			<Octane.Fragment {...props.spread}>
				<button id="tsx-spread-namespace-child">automatic namespace spread</button>
			</Octane.Fragment>
		</section>
	);
}

export function AutomaticJsxReturnedSpreadEvaluation(props: {
	first: { ref?: FragmentReference | null };
	last: { ref?: FragmentReference | null };
	explicit: FragmentReference;
	observe: (label: string, value: any) => any;
}) {
	return (
		<Group
			{...props.observe('first:expression', props.first)}
			ref={props.observe('explicit', props.explicit)}
			{...props.observe('last:expression', props.last)}
		>
			<span id="automatic-ordered-spread-child">{props.observe('child', 'ordered spread')}</span>
		</Group>
	);
}
