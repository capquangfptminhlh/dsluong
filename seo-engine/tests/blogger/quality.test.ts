import { describe, expect, it } from 'vitest';
import { validateCandidateQuality } from '../../src/blogger/quality.js';
import type { BloggerCandidate, BloggerFact, BloggerTopic } from '../../src/blogger/types.js';

const topic: BloggerTopic = {
  topicId: 'topic-pos', siteId: 'autotax-blogger-pilot', title: 'Kiểm tra cuối ca',
  intent: 'Hướng dẫn kiểm tra cuối ca', cluster: 'pos', sourceFactIds: ['fact_001'],
  contentVersion: 'v1', status: 'PENDING',
};

const facts: BloggerFact[] = [{
  factId: 'fact_001', reviewByDate: '2026-12-31T23:59:59Z',
  statement: 'Giá phần mềm AutoTax POS gói Cơ Bản là 150.000 VNĐ/tháng.', value: 150000, unit: 'VND/month',
}];
const claim = 'Giá phần mềm AutoTax POS gói Cơ Bản là 150.000 VNĐ/tháng.';

function candidate(body: string, factClaims = [{ factId: 'fact_001', claim }]): BloggerCandidate {
  return {
    title: 'Checklist kiểm tra cuối ca', slug: 'checklist-cuoi-ca', intent: topic.intent,
    cluster: topic.cluster, factClaims, body,
  };
}

const validBody = [
  `<p>Hãy đối chiếu tiền, đơn hàng và ca làm trước khi đóng ca để phát hiện chênh lệch kịp thời. ${claim}</p>`,
  '<h2>Đối chiếu doanh thu</h2><p>So sánh tổng tiền mặt với các đơn đã hoàn tất.</p>',
  '<h2>Kiểm tra hàng hóa</h2><p>Ghi nhận số lượng thiếu hoặc hư hỏng trước khi bàn giao.</p>',
  '<h2>Bàn giao ca</h2><p>Lưu biên bản và thông báo khi có chênh lệch.</p>',
].join('');

const qualitativeBody = [
  '<p>Observe the shop routine carefully and write down exceptions before they become harder to investigate.</p>',
  '<h2>Review the handover notes</h2><p>Read the notes from the previous shift and clarify any incomplete handover before starting work.</p>',
  '<h2>Keep records easy to follow</h2><p>Use consistent names for the same activity so that the owner can follow the history without guessing.</p>',
  '<h2>Discuss unusual changes early</h2><p>Tell the responsible person about an unusual pattern while the details are still clear to everyone involved.</p>',
].join('');

describe('Blogger candidate quality', () => {
  it('passes qualitative guidance when both fact arrays are empty', () => {
    const noFactTopic = { ...topic, sourceFactIds: [] };
    expect(validateCandidateQuality(candidate(qualitativeBody, []), noFactTopic, facts))
      .toEqual({ decision: 'PASS' });
  });

  it('holds a fact-free candidate that contains an undeclared number', () => {
    const noFactTopic = { ...topic, sourceFactIds: [] };
    const bodyWithNumber = qualitativeBody.replace('Observe the shop routine carefully', 'Observe the shop routine for 30 days carefully');
    expect(validateCandidateQuality(candidate(bodyWithNumber, []), noFactTopic, facts))
      .toEqual({ decision: 'HOLD', reason: 'FACT_CLAIM_UNDECLARED' });
  });

  it('holds mixed fact declarations instead of choosing a fact mode implicitly', () => {
    const noFactTopic = { ...topic, sourceFactIds: [] };
    expect(validateCandidateQuality(candidate(qualitativeBody, [{ factId: 'fact_001', claim }]), noFactTopic, facts))
      .toEqual({ decision: 'HOLD', reason: 'FACT_EVIDENCE_INVALID' });
  });

  it('passes a direct opening, three useful H2 sections, and approved fact evidence', () => {
    expect(validateCandidateQuality(candidate(validBody), topic, facts)).toEqual({ decision: 'PASS' });
  });

  it('correctly replaces a fact claim that appears multiple times in the body (tests split().join())', () => {
    const repeatedBody = validBody + `<p>Ghi chú lại: ${claim}</p>`;
    expect(validateCandidateQuality(candidate(repeatedBody), topic, facts)).toEqual({ decision: 'PASS' });
  });

  it('holds a candidate without a direct non-empty opening answer', () => {
    expect(validateCandidateQuality(candidate('<h2>Đối chiếu doanh thu</h2><p>Nội dung hướng dẫn đủ chi tiết.</p>'.repeat(3)), topic, facts))
      .toEqual({ decision: 'HOLD', reason: 'QUALITY_GATE_FAILED' });
  });

  it('holds a candidate with fewer than three useful H2 sections', () => {
    const body = `<p>Hãy kiểm tra ca làm trước khi đóng để giảm sai sót. ${claim}</p>`
      + '<h2>Đối chiếu</h2><p>So sánh tiền và đơn.</p>'
      + '<h2>Bàn giao</h2><p>Lưu biên bản.</p>';
    expect(validateCandidateQuality(candidate(body), topic, facts))
      .toEqual({ decision: 'HOLD', reason: 'QUALITY_GATE_FAILED' });
  });

  it('holds a candidate whose fact evidence is absent or outside the topic sources', () => {
    expect(validateCandidateQuality(candidate(validBody, []), topic, facts))
      .toEqual({ decision: 'HOLD', reason: 'FACT_EVIDENCE_INVALID' });
    expect(validateCandidateQuality(candidate(validBody, [{ factId: 'fact_unverified', claim }]), topic, facts))
      .toEqual({ decision: 'HOLD', reason: 'FACT_EVIDENCE_INVALID' });
  });

  it('holds a numeric, pricing, duration, SMS, or USSD claim without an exact declared fact claim', () => {
    const body = validBody.replace(claim, 'Gói này có giá 200.000 VNĐ/tháng.');
    expect(validateCandidateQuality(candidate(body, []), topic, facts))
      .toEqual({ decision: 'HOLD', reason: 'FACT_EVIDENCE_INVALID' });
  });

  it('holds a declared claim that is not present or not grounded in its fact', () => {
    expect(validateCandidateQuality(candidate(validBody, [{ factId: 'fact_001', claim: 'Giá là 200.000 VNĐ/tháng.' }]), topic, facts))
      .toEqual({ decision: 'HOLD', reason: 'FACT_EVIDENCE_INVALID' });
  });

  it('rejects numeric overlap instead of treating it as a grounded fact claim', () => {
    const altered = 'Gói Cơ Bản có giá 150000 VND mỗi tháng và được hỗ trợ ưu đãi.';
    const body = validBody.replace(claim, altered);
    expect(validateCandidateQuality(candidate(body, [{ factId: 'fact_001', claim: altered }]), topic, facts))
      .toEqual({ decision: 'HOLD', reason: 'FACT_EVIDENCE_INVALID' });
  });

  it('fails closed for accented or spelled-out factual claims without an annotation', () => {
    const body = validBody.replace(claim, 'Giá ưu đãi một trăm năm mươi nghìn đồng mỗi tháng.');
    expect(validateCandidateQuality(candidate(body, []), topic, facts))
      .toEqual({ decision: 'HOLD', reason: 'FACT_EVIDENCE_INVALID' });
  });

  it('does not count a heading-only section as useful guidance', () => {
    const body = validBody.replace('<h2>Kiểm tra hàng hóa</h2><p>Ghi nhận số lượng thiếu hoặc hư hỏng trước khi bàn giao.</p>',
      '<h2>Kiểm tra hàng hóa</h2><h3>Chỉ là tiêu đề phụ</h3>');
    expect(validateCandidateQuality(candidate(body), topic, facts))
      .toEqual({ decision: 'HOLD', reason: 'QUALITY_GATE_FAILED' });
  });
});
