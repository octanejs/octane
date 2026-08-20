import { useEffect, useRef, useState } from 'octane';
import { useHead, useSeoMeta } from '@octanejs/unhead';

export function TitleInput() @{
	const [title, setTitle] = useState('Initial Title');
	const inputRef = useRef<HTMLInputElement | null>(null);

	useHead({
		title,
	});

	useEffect(function syncInput() {
		if (inputRef.current) {
			inputRef.current.value = title;
		}
	}, [title]);

	<div>
		<input
			ref={inputRef}
			aria-label="title"
			onInput={function onTitleInput(event) {
				setTitle((event.currentTarget as HTMLInputElement).value);
			}}
		/>
	</div>
}

export function TitleMetaInput() @{
	const [title, setTitle] = useState('Initial Title');
	const [content, setContent] = useState('Initial Description');
	const inputRef = useRef<HTMLInputElement | null>(null);

	useHead({
		title,
		meta: [
			{ name: 'description', content },
			{ property: 'og:title', content: title },
		],
	});

	useEffect(function syncInput() {
		if (inputRef.current) {
			inputRef.current.value = title;
		}
	}, [title]);

	<div>
		<input
			ref={inputRef}
			aria-label="title"
			onInput={function onTitleInput(event) {
				setTitle((event.currentTarget as HTMLInputElement).value);
			}}
		/>
		<input
			value={content}
			aria-label="description"
			onInput={function onDescriptionInput(event) {
				setContent((event.currentTarget as HTMLInputElement).value);
			}}
		/>
	</div>
}

export function DarkClassToggle() @{
	const [dark, setDark] = useState(false);

	useHead({
		htmlAttrs: {
			class: {
				dark: function isDark() {
					return dark;
				},
			},
		},
	});

	<div>
		<button
			onClick={function toggle() {
				setDark(!dark);
			}}
		>
			Toggle Dark Mode
		</button>
		<span>
			{dark ? 'dark' : 'light'}
		</span>
	</div>
}

export function PageWithTitle() @{
	useHead({
		title: 'Page 1 title',
		meta: [
			{ name: 'description', content: 'page 1 description' },
		],
	});
	<div>Page 1</div>
}

export function EmptyPage() @{
	<div>Page 2</div>
}

export function ComponentTitlePage() @{
	useHead({
		title: 'Component Title',
		meta: [
			{ name: 'description', content: 'component description' },
		],
	});
	<div>Has Head</div>
}

export function PageSwitcher() @{
	const [currPage, setCurrPage] = useState<'Page 1' | 'Page 2'>('Page 2');

	<div>
		<button
			onClick={function goPage1() {
				setCurrPage('Page 1');
			}}
		>
			Page 1
		</button>
		<button
			onClick={function goPage2() {
				setCurrPage('Page 2');
			}}
		>
			Page 2
		</button>
		@if (currPage === 'Page 1') {
			<PageWithTitle />
		} @else {
			<EmptyPage />
		}
	</div>
}

export function SeoTitleInput() @{
	const [title, setTitle] = useState('Initial Title');
	const inputRef = useRef<HTMLInputElement | null>(null);

	useSeoMeta({
		title,
		description: 'Initial Description',
	});

	useEffect(function syncInput() {
		if (inputRef.current) {
			inputRef.current.value = title;
		}
	}, [title]);

	<div>
		<input
			ref={inputRef}
			aria-label="title"
			onInput={function onTitleInput(event) {
				setTitle((event.currentTarget as HTMLInputElement).value);
			}}
		/>
	</div>
}

export function SeoTitleAfterEffect() @{
	const [title, updateTitle] = useState('Initial Title');

	useSeoMeta({
		title,
		description: 'Initial Description',
	});

	useEffect(function update() {
		updateTitle('Updated Title');
	}, []);

	<div>
		<p>{title}</p>
	</div>
}
