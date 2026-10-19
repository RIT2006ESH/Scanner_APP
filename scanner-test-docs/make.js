// Builds three small test files: test.docx, test.xlsx, sample-deep.txt
const fs = require('fs');
const { zipSync, strToU8 } = require('fflate');

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// ---------- Word: a number split across two runs, like Word often does ----------
const p = (...runs) =>
  '<w:p>' + runs.map((t) => '<w:r><w:t xml:space="preserve">' + t + '</w:t></w:r>').join('') + '</w:p>';

const docx = zipSync({
  '[Content_Types].xml': strToU8(
    XML + '<Types xmlns="' + TYPES_NS + '">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>'),
  '_rels/.rels': strToU8(
    XML + '<Relationships xmlns="' + REL_NS + '">' +
    '<Relationship Id="rId1" Type="' + OFFICE_REL + '/officeDocument" Target="word/document.xml"/></Relationships>'),
  'word/document.xml': strToU8(
    XML + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    p('Card: 4111 1111 ', '1111 1111') +
    p('Aadhaar: 2345 6789 0124') +
    p('PAN: ABCPE1234F and email test.user@example.com') +
    '</w:body></w:document>'),
});
fs.writeFileSync('scanner-test-docs/test.docx', docx);

// ---------- Excel: shared strings, inline strings and a plain number ----------
const strings = ['Customer', 'Details', 'Email: rahul@example.com', 'PAN', 'Aadhaar', 'Card', '4111111111111111'];
const s = (ref, text) => '<c r="' + ref + '" t="s"><v>' + strings.indexOf(text) + '</v></c>';
const inl = (ref, text) => '<c r="' + ref + '" t="inlineStr"><is><t>' + text + '</t></is></c>';
const num = (ref, n) => '<c r="' + ref + '"><v>' + n + '</v></c>';
const row = (n, cells) => '<row r="' + n + '">' + cells + '</row>';

const SHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const xlsx = zipSync({
  '[Content_Types].xml': strToU8(
    XML + '<Types xmlns="' + TYPES_NS + '">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
    '</Types>'),
  '_rels/.rels': strToU8(
    XML + '<Relationships xmlns="' + REL_NS + '">' +
    '<Relationship Id="rId1" Type="' + OFFICE_REL + '/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
  'xl/workbook.xml': strToU8(
    XML + '<workbook xmlns="' + SHEET_NS + '" xmlns:r="' + OFFICE_REL + '">' +
    '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'),
  'xl/_rels/workbook.xml.rels': strToU8(
    XML + '<Relationships xmlns="' + REL_NS + '">' +
    '<Relationship Id="rId1" Type="' + OFFICE_REL + '/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="' + OFFICE_REL + '/sharedStrings" Target="sharedStrings.xml"/></Relationships>'),
  'xl/sharedStrings.xml': strToU8(
    XML + '<sst xmlns="' + SHEET_NS + '" count="' + strings.length + '" uniqueCount="' + strings.length + '">' +
    strings.map((t) => '<si><t>' + t + '</t></si>').join('') + '</sst>'),
  'xl/worksheets/sheet1.xml': strToU8(
    XML + '<worksheet xmlns="' + SHEET_NS + '"><sheetData>' +
    row(1, s('A1', 'Customer') + s('B1', 'Details')) +
    row(2, inl('A2', 'Rahul') + s('B2', 'Email: rahul@example.com')) +
    row(3, s('A3', 'PAN') + inl('B3', 'ABCPE1234F')) +
    row(4, s('A4', 'Aadhaar') + num('B4', '234567890124')) +
    row(5, s('A5', 'Card') + s('B5', '4111111111111111')) +
    '</sheetData></worksheet>'),
});
fs.writeFileSync('scanner-test-docs/test.xlsx', xlsx);

// ---------- Text file for the Deep scan test ----------
fs.writeFileSync(
  'scanner-test-docs/sample-deep.txt',
  [
    'Account number: 123456789012345',
    'Passport: A1234567',
    'Order id: B7654321',
    'Ref no. 987654321 for invoice',
  ].join('\n') + '\n',
);
console.log('Created test.docx, test.xlsx, sample-deep.txt');
