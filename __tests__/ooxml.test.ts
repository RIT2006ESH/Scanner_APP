jest.mock('react-native-fs', () => ({}));

import { decodeXml, joinTextRuns } from '../src/services/extraction/ooxmlExtractors';

describe('decodeXml', () => {
  it('decodes the five named entities', () => {
    expect(decodeXml('a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;')).toBe('a & b < c > d "e" \'f\'');
  });
  it('decodes decimal and hex character references', () => {
    expect(decodeXml('&#65;&#x42;')).toBe('AB');
  });
  it('leaves an invalid reference as it is', () => {
    expect(decodeXml('&#x110000000;')).toBe('&#x110000000;');
  });
  it('leaves plain text alone', () => {
    expect(decodeXml('hello 123')).toBe('hello 123');
  });
});

describe('joinTextRuns', () => {
  it('joins <t> runs (xlsx style)', () => {
    expect(joinTextRuns('<t>a</t><t>b</t>')).toBe('ab');
  });
  it('joins <w:t> runs with attributes (docx style)', () => {
    expect(joinTextRuns('<w:t xml:space="preserve">Hello </w:t><w:t>World</w:t>')).toBe('Hello World');
  });
  it('decodes entities inside runs', () => {
    expect(joinTextRuns('<t>A &amp; B</t>')).toBe('A & B');
  });
  it('does not match <tab/> or <tbl> tags', () => {
    expect(joinTextRuns('<tab/><tbl>x</tbl><t>ok</t>')).toBe('ok');
  });
  it('returns empty text when there are no runs', () => {
    expect(joinTextRuns('<p></p>')).toBe('');
  });
});
