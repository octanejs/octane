// content-collections.ts
import { defineCollection, defineConfig } from "@content-collections/core";

// src/libraries/ids.ts
var libraryIds = [
  "start",
  "router",
  "query",
  "table",
  "form",
  "virtual",
  "ranger",
  "store",
  "pacer",
  "hotkeys",
  "db",
  "ai",
  "intent",
  "workflow",
  "config",
  "devtools",
  "mcp",
  "cli",
  "react-charts",
  "create-tsrouter-app"
];

// src/utils/redirects.ts
function normalizeRedirectFrom(value) {
  if (!Array.isArray(value)) {
    return void 0;
  }
  const normalizedPaths = Array.from(
    new Set(
      value.flatMap((item) => {
        if (typeof item !== "string") {
          return [];
        }
        const trimmedItem = item.trim();
        if (!trimmedItem) {
          return [];
        }
        return [trimmedItem.startsWith("/") ? trimmedItem : `/${trimmedItem}`];
      })
    )
  );
  return normalizedPaths.length > 0 ? normalizedPaths : void 0;
}

// content-collections.ts
import { z } from "zod";
var libraryIdSet = new Set(libraryIds);
var libraryListSchema = z.string().refine(
  (value) => {
    const libraries = value.split(",").map((library) => library.trim()).filter(Boolean);
    return libraries.length > 0 && libraries.every((library) => libraryIdSet.has(library));
  },
  {
    message: `Expected comma-separated library ids: ${libraryIds.join(", ")}`
  }
);
var posts = defineCollection({
  name: "posts",
  directory: "./src/blog",
  include: "*.md",
  schema: z.object({
    title: z.string(),
    published: z.iso.date(),
    draft: z.boolean().optional(),
    excerpt: z.string(),
    authors: z.string().array(),
    library: libraryListSchema.optional(),
    content: z.string(),
    redirect_from: z.string().array().optional()
  }),
  transform: ({ content, ...post }) => {
    const headerImageMatch = content.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    const headerImage = headerImageMatch ? headerImageMatch[2] : void 0;
    const redirectFrom = normalizeRedirectFrom(post.redirect_from);
    return {
      ...post,
      slug: post._meta.path,
      headerImage,
      redirect_from: redirectFrom,
      redirectFrom,
      content
    };
  }
});
var content_collections_default = defineConfig({
  content: [posts]
});
export {
  content_collections_default as default
};
