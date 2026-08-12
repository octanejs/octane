// React-free port of react-spring v10.1.2 packages/core/src/SpringRef.ts.
import type { AnimationResult } from './AnimationResult';
import { Controller, type ControllerUpdate } from './Controller';

export class SpringRef<State extends Record<string, any> = Record<string, any>> {
	current: Controller<State>[] = [];
	add(controller: Controller<State>): void {
		if (!this.current.includes(controller)) this.current.push(controller);
	}
	delete(controller: Controller<State>): void {
		const index = this.current.indexOf(controller);
		if (index >= 0) this.current.splice(index, 1);
	}
	start(update?: ControllerUpdate<State>): Promise<Array<AnimationResult<State>>> {
		return Promise.all(this.current.map((controller) => controller.start(update ?? {})));
	}
	pause(): void {
		for (const controller of this.current) controller.pause();
	}
	resume(): void {
		for (const controller of this.current) controller.resume();
	}
	stop(cancel = false): void {
		for (const controller of this.current) controller.stop(cancel);
	}
}
