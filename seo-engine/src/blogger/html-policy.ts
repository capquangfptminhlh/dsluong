import sanitizeHtml from 'sanitize-html';

const allowedTags = [
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'u', 's',
  'blockquote', 'code', 'pre', 'a', 'img',
];
const AUTOTAX_SCREENSHOT_ORIGIN = 'https://autotaxpos.com';

interface DraftLink {
  href?: string;
  rel?: string;
}

export interface RequiredDraftImage {
  publicPath: string;
  alt: string;
}

export function sanitizeDraftHtml(html: string, allowRequiredImage = false): string {
  return sanitizeHtml(html, {
    allowedTags: allowRequiredImage ? allowedTags : allowedTags.filter((tag) => tag !== 'img'),
    allowedAttributes: {
      a: ['href', 'rel'],
      ...(allowRequiredImage ? { img: ['src', 'alt'] } : {}),
    },
    allowedSchemes: ['http', 'https'],
    disallowedTagsMode: 'discard',
  });
}

function rawImageTags(html: string): string[] {
  return html.match(/<img\b[^>]*>/giu) ?? [];
}

function assertSafeImageAttributes(tag: string): void {
  const attributes = tag
    .replace(/^<img\b/iu, '')
    .replace(/\/?\s*>$/u, '');
  const remainder = attributes.replace(
    /(?:^|\s)(?:src|alt)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+)/giu,
    '',
  );
  if (remainder.trim().length > 0) {
    throw new Error('Required screenshot contains an unsafe attribute');
  }
}

function parseImage(tag: string): { src?: string; alt?: string } {
  let image: { src?: string; alt?: string } = {};
  sanitizeHtml(tag, {
    allowedTags: ['img'],
    allowedAttributes: { img: ['src', 'alt'] },
    allowedSchemes: ['https'],
    transformTags: {
      img: (_tagName, attribs) => {
        image = { src: attribs.src, alt: attribs.alt };
        return { tagName: 'img', attribs };
      },
    },
  });
  return image;
}

/** Enforces the one real, topic-matched AutoTax screenshot assigned to this draft. */
function expectedProductionImageUrl(expectedImage: RequiredDraftImage): string {
  if (!expectedImage || !expectedImage.publicPath.startsWith('/blogger/images/')
    || expectedImage.publicPath.includes('?') || expectedImage.publicPath.includes('#')
    || expectedImage.publicPath.includes('\\') || expectedImage.publicPath.includes('//')
    || /%|(?:^|\/)\.{1,2}(?:\/|$)/u.test(expectedImage.publicPath)) {
    throw new Error('Required screenshot contract is invalid');
  }
  return new URL(expectedImage.publicPath, AUTOTAX_SCREENSHOT_ORIGIN).toString();
}

function escapeAttribute(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;').replace(/</gu, '&lt;');
}

export function buildRequiredImageMarkup(expectedImage: RequiredDraftImage): string {
  return `<img src="${escapeAttribute(expectedProductionImageUrl(expectedImage))}" alt="${escapeAttribute(expectedImage.alt)}">`;
}

export function enforceRequiredImage(
  html: string,
  expectedImage: RequiredDraftImage,
): string {
  const tags = rawImageTags(html);

  if (!expectedImage) {
    throw new Error('Required screenshot contract is missing');
  }
  if (tags.length !== 1) {
    throw new Error('Draft HTML must contain exactly one required screenshot');
  }

  assertSafeImageAttributes(tags[0]);
  const image = parseImage(tags[0]);
  if (image.src !== expectedProductionImageUrl(expectedImage)
    || image.alt !== expectedImage.alt) {
    throw new Error('Draft HTML screenshot must match the registered production URL and alt text');
  }
  return html;
}

/**
 * Produces the sole allowed image in a draft. Any model-supplied image is
 * removed before the registered screenshot is appended and sanitized.
 */
export function prepareDraftHtml(
  html: string,
  expectedImage: RequiredDraftImage,
  approvedDestination: string,
): string {
  const withoutModelImages = sanitizeDraftHtml(html);
  const sanitized = sanitizeDraftHtml(
    `${withoutModelImages}${buildRequiredImageMarkup(expectedImage)}`,
    true,
  );
  return enforceLinks(enforceRequiredImage(sanitized, expectedImage), approvedDestination);
}

function collectLinks(html: string): DraftLink[] {
  const links: DraftLink[] = [];

  sanitizeHtml(html, {
    allowedTags: ['a'],
    allowedAttributes: {
      a: ['href', 'rel'],
    },
    allowedSchemes: ['http', 'https'],
    transformTags: {
      a: (_tagName, attribs) => {
        links.push({ href: attribs.href, rel: attribs.rel });
        return { tagName: 'a', attribs };
      },
    },
  });

  return links;
}

function assertExactDestination(link: URL, approvedDestination: URL): void {
  if (
    link.origin !== approvedDestination.origin
    || link.pathname !== approvedDestination.pathname
  ) {
    throw new Error('Referral link must use the approved destination');
  }
}

export function enforceLinks(html: string, approvedDestination: string): string {
  const links = collectLinks(html);
  if (links.length > 1) {
    throw new Error('Draft HTML may contain at most one referral link');
  }
  if (links.length === 0) {
    return html;
  }

  const [link] = links;
  if (!link.href) {
    throw new Error('Referral link is malformed');
  }

  let parsedLink: URL;
  let parsedDestination: URL;
  try {
    parsedLink = new URL(link.href);
    parsedDestination = new URL(approvedDestination);
  } catch {
    throw new Error('Referral link is malformed');
  }

  if (parsedLink.protocol !== 'https:') {
    throw new Error('Referral link must use HTTPS');
  }
  // KHÔNG thêm ngoại lệ theo hostname ở đây. Gate này là "người duyệt" trong mô hình
  // full-auto (OPERATIONS_AUTOPILOT.md mục 6.5): mọi link ra ngoài phải đúng domain đã
  // duyệt và đủ UTM. Muốn dùng domain khác → đổi approvedDestination trong
  // config/blogger-sites.json, không phải bỏ qua kiểm tra.
  assertExactDestination(parsedLink, parsedDestination);

  for (const parameter of ['utm_source', 'utm_medium', 'utm_campaign']) {
    if (!parsedLink.searchParams.get(parameter)) {
      throw new Error(`Referral link must include ${parameter}`);
    }
  }

  if (link.rel !== 'nofollow noopener noreferrer') {
    throw new Error('Referral link must have rel="nofollow noopener noreferrer"');
  }

  return html;
}
