import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articlesCollection = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/articles" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.date().optional(),
    author: z.string().default('AutoTax Expert'),
    reviewer: z.string().optional(),
    coverImage: z.string().optional(),
    heroImage: z.string().optional(),
    image: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const authorsCollection = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/authors" }),
  schema: z.object({
    name: z.string(),
    role: z.string(),
    bio: z.string(),
    avatarUrl: z.string().optional(),
  }),
});

export const collections = {
  'articles': articlesCollection,
  'authors': authorsCollection,
};
