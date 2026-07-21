import { useState, useEffect } from 'octane';

type Discount = {
	code: string;
	country: string;
	discount: number;
	flag: string;
};

export function useQueryGGPPPDiscount() {
	const [ppp, setPPP] = useState<Discount | null>(null);

	useEffect(() => {
		const handleFetch = async () => {
			try {
				const res = await fetch('https://ppp.uidotdev.workers.dev/');
				const data = await res.json();
				setPPP(data);
			} catch (e) {
				setPPP(null);
			}
		};

		handleFetch();
	}, []);

	return ppp;
}
