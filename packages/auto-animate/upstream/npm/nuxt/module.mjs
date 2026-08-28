import { defineNuxtModule, createResolver, addPlugin, addImports } from '@nuxt/kit';

const module = defineNuxtModule({
  meta: {
    name: "auto-animate",
    configKey: "autoAnimate"
  },
  // Default configuration options of the Nuxt module
  defaults: {},
  setup() {
    const resolver = createResolver(import.meta.url);
    addPlugin(resolver.resolve("./runtime/plugin"));
    addImports([
      {
        name: "autoAnimate",
        from: "@formkit/auto-animate"
      },
      {
        name: "useAutoAnimate",
        from: "@formkit/auto-animate/vue"
      }
    ]);
  }
});

export { module as default };
