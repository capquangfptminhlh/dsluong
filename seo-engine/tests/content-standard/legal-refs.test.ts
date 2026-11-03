import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { buildArticlePrompt } from '../../src/content-standard/generate.js';

const FACTS = [
  {
    factId: 'fact_001',
    statement: 'Hộ kinh doanh, cá nhân kinh doanh có doanh thu từ 1 tỷ đồng/năm trở xuống được miễn thuế.',
    sourceType: 'official',
    sourceRef: 'Nghị định 141/2026/NĐ-CP',
  },
  {
    factId: 'fact_005',
    statement: 'Phần mềm AutoTax POS có chức năng chốt ca cuối ngày.',
    sourceType: 'internal',
    sourceRef: 'README.md AutoTax ERP',
  },
];

describe('neo căn cứ pháp lý vào prompt', () => {
  it('liệt kê văn bản pháp luật và cấm nhắc văn bản ngoài danh sách', () => {
    const prompt = buildArticlePrompt('Ngưỡng doanh thu chịu thuế', FACTS);

    expect(prompt).toContain('Nghị định 141/2026/NĐ-CP');
    expect(prompt).toContain('CHỈ ĐƯỢC NHẮC ĐÚNG NHỮNG VĂN BẢN SAU');
    expect(prompt).toContain('TUYỆT ĐỐI không nêu tên hay số hiệu văn bản nào ngoài danh sách');
  });

  it('không đưa nguồn nội bộ vào danh sách căn cứ pháp lý', () => {
    const prompt = buildArticlePrompt('Chốt ca', FACTS);
    const legalSection = prompt.slice(prompt.indexOf('CHỈ ĐƯỢC NHẮC ĐÚNG NHỮNG VĂN BẢN SAU'));

    expect(legalSection).not.toContain('README.md AutoTax ERP');
  });

  it('nói rõ khi chưa có văn bản nào được duyệt', () => {
    const prompt = buildArticlePrompt('Sắp xếp quầy', [FACTS[1]]);

    expect(prompt).toContain('chưa có văn bản nào được duyệt');
  });
});

describe('kho fact bám thuvienphapluat.vn', () => {
  it('mọi fact pháp lý đều có số hiệu văn bản và link tra cứu', async () => {
    const facts = JSON.parse(await readFile('data/facts.json', 'utf8'));
    const official = facts.filter((fact: any) => fact.sourceType === 'official');

    expect(official.length).toBeGreaterThan(0);
    for (const fact of official) {
      expect(fact.sourceRef, `${fact.factId} thiếu sourceRef`).toBeTruthy();
      expect(fact.sourceUrl, `${fact.factId} thiếu sourceUrl`).toContain('thuvienphapluat.vn');
    }
  });

  it('source-policy đặt thuvienphapluat.vn làm nguồn pháp lý chính', async () => {
    const policy = JSON.parse(await readFile('config/source-policy.json', 'utf8'));

    expect(policy.primaryLegalSource).toBe('thuvienphapluat.vn');
    expect(policy.allowedDomains).toContain('thuvienphapluat.vn');
    // autotax.vn là domain chết — không được nằm trong danh sách nguồn cho phép.
    expect(policy.allowedDomains).not.toContain('autotax.vn');
  });
});
