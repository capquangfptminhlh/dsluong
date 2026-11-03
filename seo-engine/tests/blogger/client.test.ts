import { describe, expect, it } from 'vitest';
import { createBloggerOAuthClient } from '../../src/blogger/auth.js';
import { createBloggerClient } from '../../src/blogger/client.js';

describe('Blogger draft-only client', () => {
  const requiredImage = {
    publicPath: '/blogger/images/autotax-pos-sale.png',
    alt: 'AutoTax point-of-sale screen for sales and store closing operations',
  };
  const imageUrl = 'https://autotaxpos.com/blogger/images/autotax-pos-sale.png';
  const htmlWithRequiredImage = `<p>x</p><img src="${imageUrl}" alt="${requiredImage.alt}">`;
  it('rejects missing OAuth values with a generic non-secret configuration error', () => {
    const secret = 'test-client-secret';

    expect(() => createBloggerOAuthClient({
      BLOGGER_OAUTH_CLIENT_ID: 'test-client-id',
      BLOGGER_OAUTH_CLIENT_SECRET: secret,
      BLOGGER_REFRESH_TOKEN: undefined,
    })).toThrow('BLOGGER_OAUTH_CONFIG_INVALID');
    expect(() => createBloggerOAuthClient({
      BLOGGER_OAUTH_CLIENT_ID: 'test-client-id',
      BLOGGER_OAUTH_CLIENT_SECRET: secret,
      BLOGGER_REFRESH_TOKEN: undefined,
    })).not.toThrow(secret);
  });

  it('always passes literal isDraft true', async () => {
    const calls: unknown[] = [];
    const client = createBloggerClient({
      insert: async (request: unknown) => {
        calls.push(request);
        return { data: { id: 'p1' } };
      },
      get: async () => ({ data: {} }),
      list: async () => ({ data: {} }),
    });

    await client.insertDraft({ blogId: 'b1', title: 'T', html: htmlWithRequiredImage, labels: [], requiredImage });

    expect(calls).toEqual([expect.objectContaining({ isDraft: true })]);
    expect(JSON.stringify(calls)).not.toContain('publish');
  });

  it('uses the ADMIN view and rejects a LIVE read-back', async () => {
    const getCalls: unknown[] = [];
    const client = createBloggerClient({
      insert: async () => ({ data: { id: 'p1' } }),
      get: async (request: unknown) => {
        getCalls.push(request);
        return {
          data: {
            id: 'p1', status: 'LIVE', title: 'T', content: '<p>x</p>', labels: ['tax'],
          },
        };
      },
      list: async () => ({ data: {} }),
    });

    await expect(client.getPostAdmin({
      blogId: 'b1', postId: 'p1', expected: { title: 'T', html: htmlWithRequiredImage, labels: ['tax'], requiredImage },
    })).rejects.toThrow('VERIFY_FAILED');
    expect(getCalls).toEqual([expect.objectContaining({ view: 'ADMIN' })]);
  });

  it('rejects changed read-back content after applying the HTML policy', async () => {
    const client = createBloggerClient({
      insert: async () => ({ data: { id: 'p1' } }),
      get: async () => ({
        data: {
          id: 'p1', status: 'DRAFT', title: 'T', content: '<p>changed</p>', labels: ['tax'],
        },
      }),
      list: async () => ({ data: {} }),
    });

    await expect(client.getPostAdmin({
      blogId: 'b1', postId: 'p1', expected: { title: 'T', html: htmlWithRequiredImage, labels: ['tax'], requiredImage },
    })).rejects.toThrow('VERIFY_FAILED');
  });

  it('rejects a changed title during read-back verification', async () => {
    const client = createBloggerClient({
      insert: async () => ({ data: { id: 'p1' } }),
      get: async () => ({
        data: { id: 'p1', status: 'DRAFT', title: 'Changed', content: '<p>x</p>', labels: ['tax'] },
      }),
      list: async () => ({ data: {} }),
    });

    await expect(client.getPostAdmin({
      blogId: 'b1', postId: 'p1', expected: { title: 'T', html: htmlWithRequiredImage, labels: ['tax'], requiredImage },
    })).rejects.toThrow('VERIFY_FAILED');
  });

  it('rejects a read-back post whose ID does not match the requested post', async () => {
    const client = createBloggerClient({
      insert: async () => ({ data: { id: 'p1' } }),
      get: async () => ({
        data: {
          id: 'different-post', blog: { id: 'b1' }, status: 'DRAFT',
          title: 'T', content: '<p>x</p>', labels: ['tax'],
        },
      }),
      list: async () => ({ data: {} }),
    });

    await expect(client.getPostAdmin({
      blogId: 'b1', postId: 'p1', expected: { title: 'T', html: htmlWithRequiredImage, labels: ['tax'], requiredImage },
    })).rejects.toThrow('VERIFY_FAILED');
  });

  it('rejects a read-back post whose blog ID does not match the requested blog', async () => {
    const client = createBloggerClient({
      insert: async () => ({ data: { id: 'p1' } }),
      get: async () => ({
        data: {
          id: 'p1', blog: { id: 'different-blog' }, status: 'DRAFT',
          title: 'T', content: '<p>x</p>', labels: ['tax'],
        },
      }),
      list: async () => ({ data: {} }),
    });

    await expect(client.getPostAdmin({
      blogId: 'b1', postId: 'p1', expected: { title: 'T', html: htmlWithRequiredImage, labels: ['tax'], requiredImage },
    })).rejects.toThrow('VERIFY_FAILED');
  });

  it('accepts Blogger-normalized label ordering during read-back verification', async () => {
    const client = createBloggerClient({
      insert: async () => ({ data: { id: 'p1' } }),
      get: async () => ({
        data: { id: 'p1', blog: { id: 'b1' }, status: 'DRAFT', title: 'T', content: htmlWithRequiredImage, labels: ['second', 'first'] },
      }),
      list: async () => ({ data: {} }),
    });

    await expect(client.getPostAdmin({
      blogId: 'b1', postId: 'p1', expected: { title: 'T', html: htmlWithRequiredImage, labels: ['first', 'second'], requiredImage },
    })).resolves.toMatchObject({ id: 'p1' });
  });

  it('treats an absent labels field as an empty label set during read-back', async () => {
    // Blogger omits `labels` entirely for a post with no labels; that must verify
    // against an empty expected list instead of failing closed.
    const client = createBloggerClient({
      insert: async () => ({ data: { id: 'p1' } }),
      get: async () => ({
        data: { id: 'p1', blog: { id: 'b1' }, status: 'DRAFT', title: 'T', content: htmlWithRequiredImage },
      }),
      list: async () => ({ data: {} }),
    });

    await expect(client.getPostAdmin({
      blogId: 'b1', postId: 'p1', expected: { title: 'T', html: htmlWithRequiredImage, labels: [], requiredImage },
    })).resolves.toMatchObject({ id: 'p1' });
  });

  it('still rejects a read-back that is missing an expected label', async () => {
    const client = createBloggerClient({
      insert: async () => ({ data: { id: 'p1' } }),
      get: async () => ({
        data: { id: 'p1', blog: { id: 'b1' }, status: 'DRAFT', title: 'T', content: htmlWithRequiredImage },
      }),
      list: async () => ({ data: {} }),
    });

    await expect(client.getPostAdmin({
      blogId: 'b1', postId: 'p1', expected: { title: 'T', html: htmlWithRequiredImage, labels: ['tax'], requiredImage },
    })).rejects.toThrow('VERIFY_FAILED');
  });

  it('rejects policy-invalid read-back HTML', async () => {
    const client = createBloggerClient({
      insert: async () => ({ data: { id: 'p1' } }),
      get: async () => ({
        data: {
          id: 'p1', status: 'DRAFT', title: 'T',
          content: '<p>x</p><script>alert(1)</script>', labels: ['tax'],
        },
      }),
      list: async () => ({ data: {} }),
    });

    await expect(client.getPostAdmin({
      blogId: 'b1', postId: 'p1', expected: { title: 'T', html: htmlWithRequiredImage, labels: ['tax'], requiredImage },
    })).rejects.toThrow('VERIFY_FAILED');
  });

  it('lists posts without exposing any mutating API operation', async () => {
    const calls: unknown[] = [];
    const client = createBloggerClient({
      insert: async () => ({ data: { id: 'p1' } }),
      get: async () => ({ data: {} }),
      list: async (request: unknown) => {
        calls.push(request);
        return { data: { items: [{ id: 'p1' }] } };
      },
    });

    await expect(client.listPosts({ blogId: 'b1' })).resolves.toEqual([{ id: 'p1' }]);
    expect(calls).toEqual([{ blogId: 'b1' }]);
  });

  it('rejects an inserted draft that omits its required curated screenshot', async () => {
    const client = createBloggerClient({
      insert: async () => ({ data: { id: 'p1' } }),
      get: async () => ({ data: {} }),
      list: async () => ({ data: {} }),
    });

    await expect(client.insertDraft({
      blogId: 'b1', title: 'T', html: '<p>x</p>', labels: [], requiredImage,
    })).rejects.toThrow(/exactly one/i);
  });

  it('fails closed when a caller omits the required screenshot contract', async () => {
    const client = createBloggerClient({
      insert: async () => ({ data: { id: 'p1' } }),
      get: async () => ({ data: {} }),
      list: async () => ({ data: {} }),
    });

    await expect(client.insertDraft({
      blogId: 'b1', title: 'T', html: '<p>x</p>', labels: [],
    // Required at compile time; runtime contract must also reject unchecked callers.
    } as never)).rejects.toThrow(/required screenshot/i);
  });

  it('rejects a relative or external screenshot URL even with a registered path', async () => {
    const client = createBloggerClient({
      insert: async () => ({ data: { id: 'p1' } }),
      get: async () => ({ data: {} }),
      list: async () => ({ data: {} }),
    });

    await expect(client.insertDraft({
      blogId: 'b1', title: 'T', labels: [], requiredImage,
      html: `<p>x</p><img src="${requiredImage.publicPath}" alt="${requiredImage.alt}">`,
    })).rejects.toThrow(/production URL/i);
    await expect(client.insertDraft({
      blogId: 'b1', title: 'T', labels: [], requiredImage,
      html: `<p>x</p><img src="https://example.com${requiredImage.publicPath}" alt="${requiredImage.alt}">`,
    })).rejects.toThrow(/production URL/i);
  });

  it('keeps the screenshot origin fixed to AutoTax when a site has another approved link destination', async () => {
    const calls: unknown[] = [];
    const client = createBloggerClient({
      insert: async (request) => { calls.push(request); return { data: { id: 'p1' } }; },
      get: async () => ({ data: {} }),
      list: async () => ({ data: {} }),
    });
    const otherDestination = 'https://other.example/';

    await expect(client.insertDraft({
      blogId: 'b1', title: 'T', labels: [], requiredImage, approvedDestination: otherDestination,
      html: `<p>x</p><img src="${imageUrl}" alt="${requiredImage.alt}">`,
    })).resolves.toMatchObject({ id: 'p1' });
    await expect(client.insertDraft({
      blogId: 'b1', title: 'T', labels: [], requiredImage, approvedDestination: otherDestination,
      html: `<p>x</p><img src="https://other.example${requiredImage.publicPath}" alt="${requiredImage.alt}">`,
    })).rejects.toThrow(/production URL/i);
    expect(calls).toHaveLength(1);
  });

  it('rejects a screenshot with only its registered alt text changed', async () => {
    const client = createBloggerClient({
      insert: async () => ({ data: { id: 'p1' } }),
      get: async () => ({ data: {} }),
      list: async () => ({ data: {} }),
    });

    await expect(client.insertDraft({
      blogId: 'b1', title: 'T', labels: [], requiredImage,
      html: `<p>x</p><img src="${imageUrl}" alt="Changed only">`,
    })).rejects.toThrow(/alt text/i);
  });

  it('rejects a screenshot that appears only inside a comment or stripped script', async () => {
    const client = createBloggerClient({
      insert: async () => ({ data: { id: 'p1' } }),
      get: async () => ({ data: {} }),
      list: async () => ({ data: {} }),
    });

    await expect(client.insertDraft({
      blogId: 'b1', title: 'T', labels: [], requiredImage,
      html: `<!-- <img src="${imageUrl}" alt="${requiredImage.alt}"> -->`,
    })).rejects.toThrow(/exactly one/i);
    await expect(client.insertDraft({
      blogId: 'b1', title: 'T', labels: [], requiredImage,
      html: `<script><img src="${imageUrl}" alt="${requiredImage.alt}"></script>`,
    })).rejects.toThrow(/exactly one/i);
  });

  it('rejects read-back whose screenshot differs from the required curated screenshot', async () => {
    const client = createBloggerClient({
      insert: async () => ({ data: { id: 'p1' } }),
      get: async () => ({
        data: {
          id: 'p1', blog: { id: 'b1' }, status: 'DRAFT', title: 'T', labels: [],
          content: '<p>x</p><img src="/blogger/images/other.png" alt="Other">',
        },
      }),
      list: async () => ({ data: {} }),
    });

    await expect(client.getPostAdmin({
      blogId: 'b1', postId: 'p1',
      expected: { title: 'T', html: htmlWithRequiredImage, labels: [], requiredImage },
    })).rejects.toThrow('VERIFY_FAILED');
  });

  it('accepts a reconciled draft only when its required curated screenshot is present', async () => {
    const client = createBloggerClient({
      insert: async () => ({ data: { id: 'p1' } }),
      get: async () => ({
        data: {
          id: 'p1', blog: { id: 'b1' }, status: 'DRAFT', title: 'T', labels: [],
          content: htmlWithRequiredImage,
        },
      }),
      list: async () => ({ data: {} }),
    });

    await expect(client.verifyKnownDraft({
      blogId: 'b1', postId: 'p1', expectedTitle: 'T', requiredImage, expectedHtml: htmlWithRequiredImage,
    })).resolves.toMatchObject({ id: 'p1' });
  });
});

describe('Blogger auto-publish client (BLOGGER_AUTOPUBLISH=true)', () => {
  const requiredImage = {
    publicPath: '/blogger/images/autotax-pos-sale.png',
    alt: 'AutoTax point-of-sale screen for sales and store closing operations',
  };
  const imageUrl = 'https://autotaxpos.com/blogger/images/autotax-pos-sale.png';
  const htmlWithRequiredImage = `<p>x</p><img src="${imageUrl}" alt="${requiredImage.alt}">`;

  it('passes isDraft false when autoPublish is enabled', async () => {
    const calls: unknown[] = [];
    const client = createBloggerClient({
      insert: async (request: unknown) => {
        calls.push(request);
        return { data: { id: 'p1' } };
      },
      get: async () => ({ data: {} }),
      list: async () => ({ data: {} }),
    }, { autoPublish: true });

    await client.insertDraft({ blogId: 'b1', title: 'T', html: htmlWithRequiredImage, labels: [], requiredImage });

    expect(calls).toEqual([expect.objectContaining({ isDraft: false })]);
  });

  it('expects a LIVE read-back and rejects a DRAFT one in auto-publish mode', async () => {
    const makeClient = (status: string) => createBloggerClient({
      insert: async () => ({ data: { id: 'p1' } }),
      get: async () => ({
        data: { id: 'p1', blog: { id: 'b1' }, status, title: 'T', content: htmlWithRequiredImage, labels: ['tax'] },
      }),
      list: async () => ({ data: {} }),
    }, { autoPublish: true });

    await expect(makeClient('LIVE').getPostAdmin({
      blogId: 'b1', postId: 'p1', expected: { title: 'T', html: htmlWithRequiredImage, labels: ['tax'], requiredImage },
    })).resolves.toMatchObject({ id: 'p1' });
    await expect(makeClient('DRAFT').getPostAdmin({
      blogId: 'b1', postId: 'p1', expected: { title: 'T', html: htmlWithRequiredImage, labels: ['tax'], requiredImage },
    })).rejects.toThrow('VERIFY_FAILED');
  });

  it('still enforces the HTML/image/link policy identically in auto-publish mode', async () => {
    const client = createBloggerClient({
      insert: async () => ({ data: { id: 'p1' } }),
      get: async () => ({ data: {} }),
      list: async () => ({ data: {} }),
    }, { autoPublish: true });

    await expect(client.insertDraft({
      blogId: 'b1', title: 'T', html: '<p>x</p>', labels: [], requiredImage,
    })).rejects.toThrow(/exactly one/i);
  });

  it('keeps draft-only behavior when the option is omitted or false', async () => {
    const calls: unknown[] = [];
    const client = createBloggerClient({
      insert: async (request: unknown) => { calls.push(request); return { data: { id: 'p1' } }; },
      get: async () => ({ data: {} }),
      list: async () => ({ data: {} }),
    }, { autoPublish: false });

    await client.insertDraft({ blogId: 'b1', title: 'T', html: htmlWithRequiredImage, labels: [], requiredImage });
    expect(calls).toEqual([expect.objectContaining({ isDraft: true })]);
  });
});
