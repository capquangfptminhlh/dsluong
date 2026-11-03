import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface ContentImage {
  imageId: string;
  publicPath: string;
  alt: string;
  clusters: string[];
  topicIds?: string[];
}

const approvedPublicPathPrefix = '/blogger/images/';

export function validateContentImageRegistry(value: unknown): ContentImage[] {
  if (!Array.isArray(value)) {
    throw new Error('Content image registry must be an array');
  }

  const imageIds = new Set<string>();
  const publicPaths = new Set<string>();

  return value.map((entry, index) => {
    const image = parseContentImage(entry, index);

    if (imageIds.has(image.imageId)) {
      throw new Error(`Duplicate imageId: ${image.imageId}`);
    }
    if (publicPaths.has(image.publicPath)) {
      throw new Error(`Duplicate publicPath: ${image.publicPath}`);
    }
    if (!image.publicPath.startsWith(approvedPublicPathPrefix)) {
      throw new Error(`publicPath must start with ${approvedPublicPathPrefix}`);
    }
    if (image.publicPath.includes('..')) {
      throw new Error('publicPath must not contain ..');
    }

    const filePath = resolve('public', `.${image.publicPath}`);
    if (!existsSync(filePath)) {
      throw new Error(`Image file does not exist: ${image.publicPath}`);
    }

    imageIds.add(image.imageId);
    publicPaths.add(image.publicPath);
    return image;
  });
}

export function loadContentImageRegistry(path = 'config/content-images.json'): ContentImage[] {
  return validateContentImageRegistry(JSON.parse(readFileSync(path, 'utf8')));
}

export function resolveContentImage(
  cluster: string,
  topicId?: string,
  images: ContentImage[] = loadContentImageRegistry(),
): ContentImage {
  const topicMatches = topicId
    ? images.filter((image) => image.topicIds?.includes(topicId))
    : [];
  const matches = topicMatches.length > 0
    ? topicMatches.filter((image) => image.clusters.includes(cluster))
    : images.filter((image) => image.clusters.includes(cluster));

  // KHÔNG fallback sang ảnh bất kỳ khi không khớp cluster: bài sẽ mang ảnh sai ngữ cảnh
  // (VD bài thuế lại chèn ảnh kho hàng) — đúng thứ docs/content-image-policy.md cấm.
  // Không có ảnh phù hợp là tín hiệu phải bổ sung ảnh/sửa cluster, không phải để máy tự bịa.
  if (matches.length === 0) {
    throw new Error('IMAGE_NOT_FOUND');
  }
  if (matches.length === 1) return matches[0];

  // Nhiều ảnh cùng cluster là điều MONG MUỐN: hàng chục bài cùng nhóm mà dùng chung một
  // ảnh thì blog trông như trại nội dung, và ảnh giống hệt nhau trên nhiều blog là dấu
  // vân tay nối chúng lại với nhau.
  //
  // Chọn theo hash của topicId chứ KHÔNG random: worker đọc lại bài đã đăng rồi so với
  // HTML kỳ vọng: nếu ảnh đổi giữa hai lần dựng thì lượt đối soát sẽ báo VERIFY_FAILED oan.
  if (!topicId) return matches[0];
  const seed = [...topicId].reduce((total, char) => (total * 31 + char.codePointAt(0)!) >>> 0, 7);
  return matches[seed % matches.length];
}

function parseContentImage(value: unknown, index: number): ContentImage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid content image entry at index ${index}`);
  }

  const entry = value as Record<string, unknown>;
  const imageId = requireText(entry.imageId, 'imageId', index);
  const publicPath = requireText(entry.publicPath, 'publicPath', index);
  const alt = requireText(entry.alt, 'alt', index);
  const clusters = requireTextArray(entry.clusters, 'clusters', index);
  const topicIds = entry.topicIds === undefined
    ? undefined
    : requireTextArray(entry.topicIds, 'topicIds', index);

  return { imageId, publicPath, alt, clusters, ...(topicIds ? { topicIds } : {}) };
}

function requireText(value: unknown, field: string, index: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string at index ${index}`);
  }
  return value;
}

function requireTextArray(value: unknown, field: string, index: number): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new Error(`${field} must be a non-empty string array at index ${index}`);
  }
  return value;
}
