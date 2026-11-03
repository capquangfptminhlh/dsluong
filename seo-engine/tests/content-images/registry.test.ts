import { describe, expect, it } from 'vitest';
import {
  loadContentImageRegistry,
  resolveContentImage,
  validateContentImageRegistry,
} from '../../src/content-images/registry.js';

describe('curated content image registry', () => {
  it('vẫn giữ đủ 4 ảnh chụp màn hình thật của AutoTax', () => {
    const images = loadContentImageRegistry();
    const ids = images.map((image) => image.imageId);

    // Ảnh chụp thật là bằng chứng sản phẩm tồn tại — ảnh minh họa AI không thay thế được.
    for (const real of ['autotax-app-dashboard', 'autotax-pos-sale', 'autotax-products-inventory', 'autotax-tax-reporting']) {
      expect(ids).toContain(real);
    }
  });

  it('mỗi cluster có ít nhất 2 ảnh để bài không lặp cùng một hình', () => {
    const images = loadContentImageRegistry();
    const perCluster: Record<string, number> = {};
    for (const image of images) {
      for (const cluster of image.clusters) perCluster[cluster] = (perCluster[cluster] ?? 0) + 1;
    }

    for (const [cluster, count] of Object.entries(perCluster)) {
      expect(count, `cluster "${cluster}" chỉ có ${count} ảnh`).toBeGreaterThanOrEqual(2);
    }
  });

  it('mọi ảnh khai trong registry đều có file thật trên đĩa', async () => {
    const { existsSync } = await import('node:fs');
    const images = loadContentImageRegistry();

    for (const image of images) {
      expect(existsSync(`public${image.publicPath}`), `thiếu file ${image.publicPath}`).toBe(true);
    }
  });

  it('resolves a topic-specific image when the cluster has multiple candidates', () => {
    const image = resolveContentImage('shared-cluster', 'topic-pos-sale', [
      {
        imageId: 'autotax-app-dashboard',
        publicPath: '/blogger/images/autotax-app-dashboard.png',
        alt: 'AutoTax dashboard',
        clusters: ['shared-cluster'],
      },
      {
        imageId: 'autotax-pos-sale',
        publicPath: '/blogger/images/autotax-pos-sale.png',
        alt: 'AutoTax POS sale',
        clusters: ['shared-cluster'],
        topicIds: ['topic-pos-sale'],
      },
    ]);

    expect(image).toMatchObject({
      imageId: 'autotax-pos-sale',
      publicPath: '/blogger/images/autotax-pos-sale.png',
    });
  });

  it('rejects a topic-specific image from a different cluster', () => {
    expect(() => resolveContentImage('inventory-management', 'topic-pos-sale', [
      {
        imageId: 'autotax-pos-sale',
        publicPath: '/blogger/images/autotax-pos-sale.png',
        alt: 'AutoTax POS sale',
        clusters: ['pos-operations'],
        topicIds: ['topic-pos-sale'],
      },
      {
        imageId: 'autotax-products-inventory',
        publicPath: '/blogger/images/autotax-products-inventory.png',
        alt: 'AutoTax inventory',
        clusters: ['inventory-management'],
      },
    ])).toThrow('IMAGE_NOT_FOUND');
  });

  it('rejects duplicate image IDs and paths', () => {
    expect(() => validateContentImageRegistry([
      {
        imageId: 'dashboard',
        publicPath: '/blogger/images/autotax-app-dashboard.png',
        alt: 'Dashboard',
        clusters: ['business-overview'],
      },
      {
        imageId: 'dashboard',
        publicPath: '/blogger/images/autotax-pos-sale.png',
        alt: 'POS sale',
        clusters: ['pos-operations'],
      },
    ])).toThrow(/duplicate imageId/i);

    expect(() => validateContentImageRegistry([
      {
        imageId: 'dashboard',
        publicPath: '/blogger/images/autotax-app-dashboard.png',
        alt: 'Dashboard',
        clusters: ['business-overview'],
      },
      {
        imageId: 'dashboard-two',
        publicPath: '/blogger/images/autotax-app-dashboard.png',
        alt: 'Another dashboard',
        clusters: ['revenue-monitoring'],
      },
    ])).toThrow(/duplicate publicPath/i);
  });

  it('rejects invalid and missing public paths', () => {
    expect(() => validateContentImageRegistry([{
      imageId: 'outside-images',
      publicPath: '/blog/autotax-app-dashboard.png',
      alt: 'Dashboard',
      clusters: ['business-overview'],
    }])).toThrow(/\/blogger\/images\//i);

    expect(() => validateContentImageRegistry([{
      imageId: 'traversal',
      publicPath: '/blogger/images/../secret.png',
      alt: 'Dashboard',
      clusters: ['business-overview'],
    }])).toThrow(/\.\./);

    expect(() => validateContentImageRegistry([{
      imageId: 'missing-file',
      publicPath: '/blogger/images/missing.png',
      alt: 'Dashboard',
      clusters: ['business-overview'],
    }])).toThrow(/does not exist/i);
  });

  it('returns a not-found error when no image matches', () => {
    expect(() => resolveContentImage('unknown-cluster')).toThrow('IMAGE_NOT_FOUND');
  });

  const sharedPool = [
    {
      imageId: 'first',
      publicPath: '/blogger/images/autotax-app-dashboard.png',
      alt: 'First image',
      clusters: ['shared-cluster'],
    },
    {
      imageId: 'second',
      publicPath: '/blogger/images/autotax-pos-sale.png',
      alt: 'Second image',
      clusters: ['shared-cluster'],
    },
    {
      imageId: 'third',
      publicPath: '/blogger/images/autotax-products-inventory.png',
      alt: 'Third image',
      clusters: ['shared-cluster'],
    },
  ];

  it('luân phiên ảnh trong cùng cluster thay vì luôn lấy ảnh đầu', () => {
    const chosen = new Set(
      ['topic-a', 'topic-b', 'topic-c', 'topic-d', 'topic-e', 'topic-f']
        .map((topicId) => resolveContentImage('shared-cluster', topicId, sharedPool).imageId),
    );

    // Hàng chục bài cùng nhóm mà chung một ảnh thì blog trông như trại nội dung.
    expect(chosen.size).toBeGreaterThan(1);
  });

  it('cùng một topicId luôn cho ra cùng một ảnh', () => {
    // Bắt buộc: worker so bài đọc lại với HTML kỳ vọng — ảnh đổi giữa hai lần dựng
    // sẽ thành VERIFY_FAILED oan.
    const first = resolveContentImage('shared-cluster', 'topic-on-dinh', sharedPool);
    const second = resolveContentImage('shared-cluster', 'topic-on-dinh', sharedPool);
    const third = resolveContentImage('shared-cluster', 'topic-on-dinh', sharedPool);

    expect(first.imageId).toBe(second.imageId);
    expect(second.imageId).toBe(third.imageId);
  });

  it('vẫn ưu tiên ảnh gán đích danh cho topic', () => {
    const pinned = [
      { ...sharedPool[0], topicIds: ['topic-dac-biet'] },
      sharedPool[1],
      sharedPool[2],
    ];

    expect(resolveContentImage('shared-cluster', 'topic-dac-biet', pinned).imageId).toBe('first');
  });
});
