import { useGameStore } from '../hooks/useGameStore';
import { Dinghy } from './Dinghy';
import { Ship } from './Ship';

interface BoatProps {
	color?: string;
}

export function Boat({ color = '#FFEEDD' }: BoatProps) {
	const { boatType } = useGameStore();

	if (boatType === 'dinghy') {
		return <Dinghy color="#C4A484" />;
	}

	return <Ship color={color} />;
}
