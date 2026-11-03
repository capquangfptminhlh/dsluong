import { describe, expect, it } from 'vitest';
import { preparePrimaryArticle } from '../../src/content-images/primary-article.js';

const images = [
  {
    imageId: 'autotax-pos-sale',
    publicPath: '/blogger/images/autotax-pos-sale.png',
    alt: 'AutoTax point-of-sale screen',
    clusters: ['pos-operations'],
  },
];

describe('primary article image preparation', () => {
  it('uses the resolved screenshot as coverImage and inserts it immediately after H1', () => {
    const result = preparePrimaryArticle({
      title: 'Máy POS tính tiền cảm ứng',
      cluster: 'pos-operations',
      body: '# Máy POS tính tiền cảm ứng\n\nMở đầu bài viết.\n\n## Nội dung',
      images,
    });

    expect(result.coverImage).toBe('/blogger/images/autotax-pos-sale.png');
    expect(result.body).toBe(
      '# Máy POS tính tiền cảm ứng\n\n![AutoTax point-of-sale screen](/blogger/images/autotax-pos-sale.png)\n\nMở đầu bài viết.\n\n## Nội dung',
    );
  });

  it('removes inline, reference-style, and HTML model images so only the approved screenshot remains', () => {
    const result = preparePrimaryArticle({
      title: 'Máy POS tính tiền cảm ứng',
      cluster: 'pos-operations',
      body: `# Máy POS tính tiền cảm ứng

![Ảnh mặc định](https://example.com/image.png "Ảnh ngoài")

![Ảnh tham chiếu][default-image]

Nội dung.

<img src="https://example.com/html-image.png" alt="Ảnh HTML">

<picture><source srcset="https://example.com/picture.webp"><img src="https://example.com/picture.png" alt="Ảnh picture"></picture>

<svg><image href="https://example.com/vector-image.png" /></svg>

[default-image]: /blog/img_pos.png`,
      images,
    });

    expect(result.body.match(/!\[/g)).toHaveLength(1);
    expect(result.body).toContain('![AutoTax point-of-sale screen](/blogger/images/autotax-pos-sale.png)');
    expect(result.body).not.toContain('<img');
    expect(result.body).not.toMatch(/<(?:picture|source|svg|image)\b/i);
    expect(result.body).not.toContain('default-image');
    expect(result.body).not.toContain('example.com');
  });

  it('fails before content is written when no matching screenshot exists', () => {
    expect(() => preparePrimaryArticle({
      title: 'Máy POS tính tiền cảm ứng',
      cluster: 'unknown-cluster',
      body: '# Máy POS tính tiền cảm ứng\n\nNội dung.',
      images,
    })).toThrow('IMAGE_NOT_FOUND');
  });

  it('fails closed for unsupported image-looking markup', () => {
    expect(() => preparePrimaryArticle({
      title: 'Máy POS tính tiền cảm ứng',
      cluster: 'pos-operations',
      body: '# Máy POS tính tiền cảm ứng\n\n![Ảnh bị lỗi](https://example.com/unfinished',
      images,
    })).toThrow('PRIMARY_ARTICLE_IMAGE_POLICY_FAILED');
  });

  it('rejects raw HTML that could render an external image through CSS or media attributes', () => {
    expect(() => preparePrimaryArticle({
      title: 'Máy POS tính tiền cảm ứng',
      cluster: 'pos-operations',
      body: '# Máy POS tính tiền cảm ứng\n\n<div style="background-image: url(https://external.example/ad.png)">Nội dung</div>',
      images,
    })).toThrow('PRIMARY_ARTICLE_IMAGE_POLICY_FAILED');

    expect(() => preparePrimaryArticle({
      title: 'Máy POS tính tiền cảm ứng',
      cluster: 'pos-operations',
      body: '# Máy POS tính tiền cảm ứng\n\n<video poster="https://external.example/poster.png"></video>',
      images,
    })).toThrow('PRIMARY_ARTICLE_IMAGE_POLICY_FAILED');
  });

  it('does not consume a following-line paragraph link as an image reference and strips shortcut definitions', () => {
    const result = preparePrimaryArticle({
      title: 'Máy POS tính tiền cảm ứng',
      cluster: 'pos-operations',
      body: `# Máy POS tính tiền cảm ứng

![Ảnh sản phẩm]
[Xem hướng dẫn](https://autotaxpos.com/huong-dan)

[Ảnh sản phẩm]: https://external.example/product-image.png`,
      images,
    });

    expect(result.body).toContain('[Xem hướng dẫn](https://autotaxpos.com/huong-dan)');
    expect(result.body).not.toContain('external.example');
    expect(result.body.match(/!\[/g)).toHaveLength(1);
  });
});
