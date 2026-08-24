import { vAutoAnimate } from "../../vue/index"

type NuxtAppLike = {
  vueApp: {
    directive: (
      name: string,
      directive: typeof vAutoAnimate
    ) => void
  }
}

export default function autoAnimateNuxtPlugin(app: NuxtAppLike) {
  // Register the directive
  app.vueApp.directive("auto-animate", vAutoAnimate)
}
