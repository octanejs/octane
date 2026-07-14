interface Profile {
	name: string;
	email: string;
}

export function App(_props: { onSave: (profile: Profile) => void }) @{
	<form onSubmit={(event: SubmitEvent) => event.preventDefault()} noValidate>
		<h1>Edit profile</h1>
		<label for="name">Name</label>
		<input id="name" name="name" />
		<label for="email">Email</label>
		<input id="email" name="email" type="email" />
		<button type="submit">Save profile</button>
	</form>
}
