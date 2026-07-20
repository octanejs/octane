import alpineLogo from '../images/alpine-logo.svg';
import angularLogo from '../images/angular-logo.svg';
import emberLogo from '../images/ember-logo.svg';
import jsLogo from '../images/js-logo.svg';
import litLogo from '../images/lit-logo.svg';
import markoLogo from '../images/marko-logo.svg';
import qwikLogo from '../images/qwik-logo.svg';
import preactLogo from '../images/preact-logo.svg';
import reactLogo from '../images/react-logo.svg';
import solidLogo from '../images/solid-logo.svg';
import svelteLogo from '../images/svelte-logo.svg';
import vueLogo from '../images/vue-logo.svg';
import type { Framework } from './types';

export const frameworkOptions = [
	{
		label: 'React',
		value: 'react',
		logo: reactLogo,
		color: 'bg-blue-500',
		fontColor: 'text-sky-500',
	},
	{
		label: 'Preact',
		value: 'preact',
		logo: preactLogo,
		color: 'bg-purple-500',
		fontColor: 'text-purple-500',
	},
	{
		label: 'Vue',
		value: 'vue',
		logo: vueLogo,
		color: 'bg-green-500',
		fontColor: 'text-green-500',
	},
	{
		label: 'Angular',
		value: 'angular',
		logo: angularLogo,
		color: 'bg-red-500',
		fontColor: 'text-fuchsia-500',
	},
	{
		label: 'Ember',
		value: 'ember',
		logo: emberLogo,
		color: 'bg-orange-600',
		fontColor: 'text-orange-600',
	},
	{
		label: 'Solid',
		value: 'solid',
		logo: solidLogo,
		color: 'bg-blue-600',
		fontColor: 'text-blue-600',
	},
	{
		label: 'Svelte',
		value: 'svelte',
		logo: svelteLogo,
		color: 'bg-orange-600',
		fontColor: 'text-orange-600',
	},
	{
		label: 'Marko',
		value: 'marko',
		logo: markoLogo,
		color: 'bg-cyan-500',
		fontColor: 'text-cyan-500',
	},
	{
		label: 'Qwik',
		value: 'qwik',
		logo: qwikLogo,
		color: 'bg-indigo-500',
		fontColor: 'text-indigo-500',
	},
	{
		label: 'Lit',
		value: 'lit',
		logo: litLogo,
		color: 'bg-emerald-500',
		fontColor: 'text-emerald-500',
	},
	{
		label: 'Alpine',
		value: 'alpine',
		logo: alpineLogo,
		color: 'bg-slate-500',
		fontColor: 'text-slate-500',
	},
	{
		label: 'Vanilla',
		value: 'vanilla',
		logo: jsLogo,
		color: 'bg-yellow-500',
		fontColor: 'text-yellow-500',
	},
] as const;

export function getFrameworkOptions(frameworkStrs: Framework[]) {
	return frameworkOptions.filter((d) => frameworkStrs.includes(d.value));
}
