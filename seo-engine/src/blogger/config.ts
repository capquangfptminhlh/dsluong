import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { BloggerSite, BloggerTopic } from './types.js';

const nonEmptyText = z.string().trim().min(1);

const approvedDestinationSchema = z.url().refine(
  (value) => new URL(value).protocol === 'https:',
  'approvedDestination must use HTTPS',
);

const bloggerSiteSchema = z.object({
  siteId: nonEmptyText,
  blogId: nonEmptyText,
  enabled: z.boolean(),
  charter: nonEmptyText,
  cadenceDays: z.number().int().min(1).max(90),
  approvedDestination: approvedDestinationSchema.optional(),
});

const bloggerSitesSchema = z.object({
  // Tối đa 5 blog, mỗi blog PHẢI là một ngách riêng (charter riêng, hàng đợi topic riêng).
  // Nhiều blog cùng chủ đề, cùng giọng văn, cùng trỏ link về một đích = hình dạng của PBN,
  // thứ Google phạt nặng nhất. Giới hạn này là hàng rào có chủ đích, không phải con số tùy tiện.
  sites: z.array(bloggerSiteSchema).max(5, 'A maximum of 5 Blogger sites is allowed'),
}).superRefine(({ sites }, context) => {
  const siteIds = new Set<string>();
  const blogIds = new Set<string>();

  for (const [index, site] of sites.entries()) {
    if (siteIds.has(site.siteId)) {
      context.addIssue({ code: 'custom', path: ['sites', index, 'siteId'], message: 'siteId must be unique' });
    }
    if (blogIds.has(site.blogId)) {
      context.addIssue({ code: 'custom', path: ['sites', index, 'blogId'], message: 'blogId must be unique' });
    }
    siteIds.add(site.siteId);
    blogIds.add(site.blogId);
  }
});

const topicSchema = z.object({
  topicId: nonEmptyText,
  siteId: nonEmptyText,
  title: nonEmptyText,
  intent: nonEmptyText,
  cluster: nonEmptyText,
  // Qualitative topics intentionally have no external fact claims. Their bodies are
  // still constrained by the quality gate, which blocks quantitative/fact-like text.
  sourceFactIds: z.array(nonEmptyText),
  contentVersion: nonEmptyText,
  status: z.enum(['PENDING', 'GENERATED', 'COMPLETED', 'HOLD', 'REGENERATE']),
  // Kênh tiêu thụ topic. Hai kênh có hàng đợi riêng để không giành nhau và để nội dung
  // Blogger giữ đúng charter (checklist vận hành), không trùng bài web chính.
  // Thiếu channel = 'main' (giữ tương thích với topic cũ).
  channel: z.enum(['main', 'blogger']).optional(),
  forbiddenPrimarySlugs: z.array(nonEmptyText).optional(),
});

const topicArraySchema = z.array(topicSchema);

export function parseBloggerSites(value: unknown): BloggerSite[] {
  return bloggerSitesSchema.parse(value).sites;
}

export function parseTopics(value: unknown, siteIds: Set<string>): BloggerTopic[] {
  const topics = topicArraySchema.parse(value);
  for (const topic of topics) {
    if (!siteIds.has(topic.siteId)) {
      throw new Error(`Unknown siteId: ${topic.siteId}`);
    }
  }
  return topics;
}

export function loadBloggerSites(path = 'config/blogger-sites.json'): BloggerSite[] {
  return parseBloggerSites(JSON.parse(readFileSync(path, 'utf8')));
}

export function loadTopics(path = 'config/topics.json', siteIds: Set<string>): BloggerTopic[] {
  return parseTopics(JSON.parse(readFileSync(path, 'utf8')), siteIds);
}
