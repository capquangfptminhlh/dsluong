import { describe, expect, it } from 'vitest';
import {
  enforceLinks,
  enforceRequiredImage,
  prepareDraftHtml,
  sanitizeDraftHtml,
} from '../../src/blogger/html-policy.js';

const approvedDestination = 'https://autotaxpos.com/';
const validLink = '<a href="https://autotaxpos.com/?utm_source=blogger&utm_medium=referral&utm_campaign=summer" rel="nofollow noopener noreferrer">Learn more</a>';
const requiredImage = {
  publicPath: '/blogger/images/autotax-pos-sale.png',
  alt: 'AutoTax point-of-sale screen for sales and store closing operations',
};
const requiredImageUrl = 'https://autotaxpos.com/blogger/images/autotax-pos-sale.png';

describe('Blogger draft HTML policy', () => {
  it('removes disallowed elements and event attributes while retaining semantic text', () => {
    expect(sanitizeDraftHtml('<p onclick="x()">Safe <strong>text</strong></p><script>alert(1)</script><style>p{color:red}</style><iframe src="https://example.com"></iframe><img src="x">'))
      .toBe('<p>Safe <strong>text</strong></p>');
  });

  it('allows draft HTML with no links', () => {
    expect(enforceLinks('<p>No referral link is needed.</p>', approvedDestination))
      .toBe('<p>No referral link is needed.</p>');
  });

  it('allows one compliant referral link', () => {
    expect(enforceLinks(`<p>${validLink}</p>`, approvedDestination)).toBe(`<p>${validLink}</p>`);
  });

  it('rejects a second referral link', () => {
    expect(() => enforceLinks(`<p>${validLink}${validLink}</p>`, approvedDestination)).toThrow(/one/i);
  });

  it('rejects a link outside the exact configured destination', () => {
    expect(() => enforceLinks('<a href="https://autotaxpos.com/pricing?utm_source=blogger&utm_medium=referral&utm_campaign=summer" rel="nofollow noopener noreferrer">Learn more</a>', approvedDestination))
      .toThrow(/destination/i);
  });

  it('rejects a malformed or non-HTTPS link', () => {
    expect(() => enforceLinks('<a href="https://%" rel="nofollow noopener noreferrer">Learn more</a>', approvedDestination))
      .toThrow(/malformed/i);
    expect(() => enforceLinks('<a href="http://autotaxpos.com/?utm_source=blogger&utm_medium=referral&utm_campaign=summer" rel="nofollow noopener noreferrer">Learn more</a>', approvedDestination))
      .toThrow(/HTTPS/i);
  });

  it('rejects links with missing campaign parameters or a non-exact rel value', () => {
    expect(() => enforceLinks('<a href="https://autotaxpos.com/?utm_source=blogger&utm_medium=referral" rel="nofollow noopener noreferrer">Learn more</a>', approvedDestination))
      .toThrow(/utm_campaign/i);
    expect(() => enforceLinks('<a href="https://autotaxpos.com/?utm_source=blogger&utm_medium=referral&utm_campaign=summer" rel="noopener nofollow noreferrer">Learn more</a>', approvedDestination))
      .toThrow(/rel/i);
  });

  it('requires exactly the curated screenshot with its registered alt text', () => {
    const html = `<p>Close the day with this view.</p><img src="${requiredImageUrl}" alt="${requiredImage.alt}">`;

    expect(enforceRequiredImage(html, requiredImage)).toBe(html);
    expect(sanitizeDraftHtml(html, true)).toBe(`<p>Close the day with this view.</p><img src="${requiredImageUrl}" alt="AutoTax point-of-sale screen for sales and store closing operations" />`);
  });

  it('removes model-supplied images and deterministically appends the registered screenshot', () => {
    const raw = '<p>Use this checklist before closing a store shift.</p>'
      + '<img src="https://example.com/model.png" alt="Model image">';

    expect(prepareDraftHtml(raw, requiredImage, approvedDestination)).toBe(
      `<p>Use this checklist before closing a store shift.</p><img src="${requiredImageUrl}" alt="${requiredImage.alt}" />`,
    );
  });

  it('rejects a missing, duplicated, or unregistered screenshot', () => {
    expect(() => enforceRequiredImage('<p>Missing image</p>', requiredImage)).toThrow(/exactly one/i);
    expect(() => enforceRequiredImage(`<img src="${requiredImageUrl}" alt="${requiredImage.alt}"><img src="${requiredImageUrl}" alt="${requiredImage.alt}">`, requiredImage)).toThrow(/exactly one/i);
    expect(() => enforceRequiredImage('<img src="https://autotaxpos.com/blogger/images/other.png" alt="Other">', requiredImage)).toThrow(/registered/i);
  });

  it('rejects screenshot markup with an unsafe or extra attribute', () => {
    expect(() => enforceRequiredImage(`<img src="${requiredImageUrl}" alt="${requiredImage.alt}" onerror="alert(1)">`, requiredImage)).toThrow(/unsafe/i);
    expect(() => enforceRequiredImage(`<img src="${requiredImageUrl}" alt="${requiredImage.alt}" width="1200">`, requiredImage)).toThrow(/unsafe/i);
  });

  it('does not count screenshot markup hidden in a comment or stripped parent element', () => {
    expect(() => enforceRequiredImage(
      sanitizeDraftHtml(`<!-- <img src="${requiredImageUrl}" alt="${requiredImage.alt}"> -->`, true),
      requiredImage,
    )).toThrow(/exactly one/i);
    expect(() => enforceRequiredImage(
      sanitizeDraftHtml(`<script><img src="${requiredImageUrl}" alt="${requiredImage.alt}"></script>`, true),
      requiredImage,
    )).toThrow(/exactly one/i);
  });

  it('rejects a non-canonical screenshot registry path at runtime', () => {
    expect(() => enforceRequiredImage(
      `<img src="${requiredImageUrl}" alt="${requiredImage.alt}">`,
      { ...requiredImage, publicPath: '/blogger/images/%2fescape.png' },
    )).toThrow(/contract/i);
    expect(() => enforceRequiredImage(
      `<img src="${requiredImageUrl}" alt="${requiredImage.alt}">`,
      { ...requiredImage, publicPath: '/blogger/images//double.png' },
    )).toThrow(/contract/i);
    expect(() => enforceRequiredImage(
      `<img src="${requiredImageUrl}" alt="${requiredImage.alt}">`,
      { ...requiredImage, publicPath: '/blogger/images/../escape.png' },
    )).toThrow(/contract/i);
  });
});
