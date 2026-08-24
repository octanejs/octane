export default function uid(): string {
	return Math.random().toString(36).substring(6);
}
