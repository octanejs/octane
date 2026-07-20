import { allMaintainers, type Maintainer } from '~/libraries/maintainers';

export function findMaintainerByAuthorName(name: string): Maintainer | undefined {
	return allMaintainers.find((maintainer) => maintainer.name === name);
}
