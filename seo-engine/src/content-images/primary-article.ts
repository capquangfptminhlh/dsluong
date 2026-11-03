import { resolveContentImage, type ContentImage } from './registry.js';

export interface PrimaryArticleInput {
  title: string;
  cluster: string;
  topicId?: string;
  body: string;
  images?: ContentImage[];
}

export interface PreparedPrimaryArticle {
  body: string;
  coverImage: string;
}

const markdownInlineImagePattern = /!\[[^\]]*\][ \t]*\((?:\\.|[^)])*\)/g;
const markdownReferenceImagePattern = /!\[([^\]]*)\][ \t]*\[([^\]]*)\]/g;
const markdownShortcutImagePattern = /!\[([^\]]+)\](?![ \t]*(?:\(|\[))/g;
const htmlImageContainerPattern = /<(?:picture|svg)\b[^>]*>[\s\S]*?<\/(?:picture|svg)\s*>/gi;
const htmlImagePattern = /<(?:img|source|image)\b[^>]*>/gi;

/**
 * Makes the registry screenshot the only Markdown image in a generated primary
 * article. Resolution happens before callers construct/write frontmatter.
 */
export function preparePrimaryArticle(input: PrimaryArticleInput): PreparedPrimaryArticle {
  const image = resolveContentImage(input.cluster, input.topicId, input.images);
  const bodyWithoutModelImages = removeModelImages(input.body);
  const h1Match = bodyWithoutModelImages.match(/^# .+$/m);

  if (!h1Match || h1Match.index === undefined) {
    throw new Error('PRIMARY_ARTICLE_H1_REQUIRED');
  }

  const imageMarkdown = `![${image.alt}](${image.publicPath})`;
  const insertAt = h1Match.index + h1Match[0].length;
  const body = `${bodyWithoutModelImages.slice(0, insertAt)}\n\n${imageMarkdown}\n\n${bodyWithoutModelImages.slice(insertAt).trimStart()}`.trim();

  return { body, coverImage: image.publicPath };
}

function removeModelImages(body: string): string {
  const referenceIds = new Set<string>();
  const withoutImages = body
    .replace(markdownInlineImagePattern, '')
    .replace(markdownReferenceImagePattern, (_, alt: string, reference: string) => {
      referenceIds.add(normalizeReferenceId(reference || alt));
      return '';
    })
    .replace(markdownShortcutImagePattern, (_, alt: string) => {
      referenceIds.add(normalizeReferenceId(alt));
      return '';
    })
    .replace(htmlImageContainerPattern, '')
    .replace(htmlImagePattern, '');

  const withoutImageDefinitions = withoutImages.replace(
    /^\s{0,3}\[([^\]]+)\]:[^\n]*(?:\n|$)/gm,
    (definition, reference: string) => referenceIds.has(normalizeReferenceId(reference)) ? '' : definition,
  ).trim();

  // Generated primary content is Markdown-only. Raw HTML can carry image URLs
  // through CSS, poster/srcset, embeds, or future elements we do not parse.
  // Fail closed rather than maintaining an incomplete HTML image allowlist.
  if (/!\[|<\/?[a-z][^>]*>/i.test(withoutImageDefinitions)) {
    throw new Error('PRIMARY_ARTICLE_IMAGE_POLICY_FAILED');
  }

  return withoutImageDefinitions;
}

function normalizeReferenceId(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}
