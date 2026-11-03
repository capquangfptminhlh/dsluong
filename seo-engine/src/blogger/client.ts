import {
  enforceLinks,
  enforceRequiredImage,
  prepareDraftHtml,
  sanitizeDraftHtml,
  type RequiredDraftImage,
} from './html-policy.js';

const DEFAULT_APPROVED_DESTINATION = 'https://autotaxpos.com/';

export interface BloggerPost {
  id?: string | null;
  blog?: { id?: string | null } | null;
  status?: string | null;
  title?: string | null;
  content?: string | null;
  labels?: string[] | null;
}

export interface BloggerPostsApi {
  insert(request: {
    blogId: string;
    isDraft: boolean;
    requestBody: { title: string; content: string; labels: string[] };
  }): Promise<{ data: BloggerPost }>;
  get(request: { blogId: string; postId: string; view: 'ADMIN' }): Promise<{ data: BloggerPost }>;
  list(request: { blogId: string }): Promise<{ data: { items?: BloggerPost[] | null } }>;
}

export interface InsertDraftInput {
  blogId: string;
  title: string;
  html: string;
  labels: string[];
  approvedDestination?: string;
  requiredImage: RequiredDraftImage;
}

export interface GetPostAdminInput {
  blogId: string;
  postId: string;
  expected: Omit<InsertDraftInput, 'blogId' | 'approvedDestination'> & {
    approvedDestination?: string;
  };
}

export interface ListPostsInput {
  blogId: string;
}

export interface VerifyKnownDraftInput {
  blogId: string;
  postId: string;
  expectedTitle: string;
  approvedDestination?: string;
  requiredImage: RequiredDraftImage;
  expectedHtml: string;
}

function policyHtml(
  html: string,
  approvedDestination: string | undefined,
  requiredImage: RequiredDraftImage,
): string {
  const destination = approvedDestination ?? DEFAULT_APPROVED_DESTINATION;
  // The worker injects the image, but the client independently rejects a
  // missing or substituted screenshot from any unchecked caller/read-back.
  const supplied = sanitizeDraftHtml(html, true);
  enforceLinks(enforceRequiredImage(supplied, requiredImage), destination);
  return prepareDraftHtml(supplied, requiredImage, destination);
}

function sameLabels(actual: string[] | null | undefined, expected: string[]): boolean {
  // Blogger trả về undefined (không phải []) cho bài không gắn nhãn — coi undefined
  // tương đương danh sách rỗng, nếu không mọi bài không label đều bị VERIFY_FAILED oan.
  const actualLabels = [...(actual ?? [])].sort();
  const expectedLabels = [...expected].sort();
  if (actualLabels.length !== expectedLabels.length) return false;
  return actualLabels.every((label, index) => label === expectedLabels[index]);
}

function comparableText(html: string): string {
  return sanitizeDraftHtml(html)
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/\s+/gu, ' ')
    .trim();
}

function rawHtmlHasForbiddenMarkup(html: string): boolean {
  return /<(?:script|style|iframe)\b|\son[a-z]+\s*=/iu.test(html);
}

function verifyPost(post: BloggerPost, input: GetPostAdminInput, expectedStatus: 'DRAFT' | 'LIVE'): void {
  const { expected } = input;
  const expectedHtml = policyHtml(expected.html, expected.approvedDestination, expected.requiredImage);
  const actualHtml = post.content ?? '';
  // Re-run the destination/UTM/rel policy against the API read-back.
  try {
    policyHtml(actualHtml, expected.approvedDestination, expected.requiredImage);
  } catch {
    throw new Error('VERIFY_FAILED');
  }
  if (
    post.id !== input.postId
    || post.blog?.id !== input.blogId
    || post.status !== expectedStatus
    || post.title !== expected.title
    // Blogger can normalize harmless markup and label order. Its visible text and
    // enforced link policy must still match the exact submitted draft.
    || comparableText(actualHtml) !== comparableText(expectedHtml)
    || rawHtmlHasForbiddenMarkup(actualHtml)
    || !sameLabels(post.labels, expected.labels)
  ) {
    throw new Error('VERIFY_FAILED');
  }
}

export interface BloggerClientOptions {
  /**
   * false (mặc định): chế độ Pilot — chỉ tạo Draft, người thật bấm Publish.
   * true: full-auto — bài pass hết gate được đăng LIVE ngay (BLOGGER_AUTOPUBLISH=true).
   * Gate (facts/originality/quality/html-policy) chạy TRƯỚC khi insert nên
   * autoPublish không bao giờ nới lỏng kiểm duyệt — chỉ bỏ bước bấm nút tay.
   */
  autoPublish?: boolean;
}

export function createBloggerClient(posts: BloggerPostsApi, options: BloggerClientOptions = {}) {
  const autoPublish = options.autoPublish === true;
  const expectedStatus: 'DRAFT' | 'LIVE' = autoPublish ? 'LIVE' : 'DRAFT';
  return {
    async insertDraft(input: InsertDraftInput): Promise<BloggerPost> {
      const content = policyHtml(input.html, input.approvedDestination, input.requiredImage);
      try {
        const response = await posts.insert({
          blogId: input.blogId,
          isDraft: !autoPublish,
          requestBody: { title: input.title, content, labels: [...input.labels] },
        });
        return response.data;
      } catch {
        throw new Error('BLOGGER_INSERT_FAILED');
      }
    },

    async getPostAdmin(input: GetPostAdminInput): Promise<BloggerPost> {
      let post: BloggerPost;
      try {
        const response = await posts.get({
          blogId: input.blogId,
          postId: input.postId,
          view: 'ADMIN',
        });
        post = response.data;
      } catch {
        throw new Error('BLOGGER_READ_FAILED');
      }
      verifyPost(post, input, expectedStatus);
      return post;
    },

    async verifyKnownDraft(input: VerifyKnownDraftInput): Promise<BloggerPost> {
      let post: BloggerPost;
      try {
        const response = await posts.get({
          blogId: input.blogId,
          postId: input.postId,
          view: 'ADMIN',
        });
        post = response.data;
        const expectedHtml = policyHtml(input.expectedHtml, input.approvedDestination, input.requiredImage);
        const actualHtml = policyHtml(post.content ?? '', input.approvedDestination, input.requiredImage);
        if (comparableText(actualHtml) !== comparableText(expectedHtml)) throw new Error('VERIFY_FAILED');
      } catch {
        throw new Error('VERIFY_FAILED');
      }
      if (
        post.id !== input.postId
        || post.blog?.id !== input.blogId
        || post.status !== expectedStatus
        || post.title !== input.expectedTitle
        || rawHtmlHasForbiddenMarkup(post.content ?? '')
      ) throw new Error('VERIFY_FAILED');
      return post;
    },

    async listPosts(input: ListPostsInput): Promise<BloggerPost[]> {
      try {
        const response = await posts.list({ blogId: input.blogId });
        return response.data.items ?? [];
      } catch {
        throw new Error('BLOGGER_LIST_FAILED');
      }
    },
  };
}
