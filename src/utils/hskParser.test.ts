import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  cleanHskHanzi,
  formatChinesePos,
  groupPdfTextItemsIntoLines,
  isOfficialHskText,
  parseOfficialHskText,
} from './hskParser';

test('cleanHskHanzi strips disambiguating sense digits and preserves senseTag', () => {
  assert.deepEqual(cleanHskHanzi('本1'), { hanzi: '本', senseTag: 'Sense 1' });
  assert.deepEqual(cleanHskHanzi('点2'), { hanzi: '点', senseTag: 'Sense 2' });
  assert.deepEqual(cleanHskHanzi('你好'), { hanzi: '你好' });
});

test('formatChinesePos translates Chinese POS tags cleanly', () => {
  assert.equal(formatChinesePos('动'), 'Verb (动)');
  assert.equal(formatChinesePos('数、（副）'), 'Number, (Adverb) (数、（副）)');
});

test('isOfficialHskText detects official HSK table headers and numbered rows', () => {
  assert.equal(
    isOfficialHskText('序号 等级 词语 拼音 词性\n1 1 爱 ài 动'),
    true
  );
  assert.equal(isOfficialHskText('你好 | nǐ hǎo | hello'), false);
});

test('parseOfficialHskText parses multi-row OCR block, multi-word pinyin, and homographs', () => {
  const sampleOcr = `序号 等级 词语 拼音 词性 1 1 爱 ài 动 7 1（4） 半 bàn 数、（副） 14 1 不客气 bú kèqi 10 1 本1 běn 量 82 1 会1 huì 动 683 3 会2 huì 名 77 汉考国际 汉考国际`;
  const result = parseOfficialHskText(sampleOcr);

  assert.equal(result.skippedLines.length, 0);
  assert.equal(result.rows.length, 6);

  assert.equal(result.rows[0].hanzi, '爱');
  assert.equal(result.rows[0].pinyin, 'ài');
  assert.equal(result.rows[0].hskLevel, 1);
  assert.equal(result.rows[0].translation, 'to love; affection');

  assert.equal(result.rows[1].hanzi, '半');
  assert.equal(result.rows[1].rawLevel, '1（4）');

  assert.equal(result.rows[2].hanzi, '不客气');
  assert.equal(result.rows[2].pinyin, 'bú kèqi');
  assert.equal(result.rows[2].translation, "you're welcome");

  assert.equal(result.rows[3].hanzi, '本');
  assert.equal(result.rows[3].notes, 'HSK 1 · Measure word (量) · Sense 1');

  assert.equal(result.rows[4].hanzi, '会');
  assert.equal(result.rows[4].translation, 'can; to be able to; will');
  assert.equal(result.rows[5].hanzi, '会');
  assert.equal(result.rows[5].hskLevel, 3);
  assert.equal(result.rows[5].translation, 'meeting; gathering');
});

test('groupPdfTextItemsIntoLines clusters Y rows and separates columns by tabs', () => {
  const lines = groupPdfTextItemsIntoLines([
    { str: '14', x: 86, y: 500 },
    { str: '1', x: 161, y: 500 },
    { str: '不客气', x: 229, y: 500 },
    { str: 'bú', x: 318, y: 501 },
    { str: 'kèqi', x: 334, y: 501 },
  ]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0], '14\t1\t不客气\tbú kèqi');
});

test('parses all 1000 words from official HSK 1-3 PDF cleanly without missing words or translations', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(
    fs.readFileSync('public/assets/aistudio/1-3______6bc15a87.pdf')
  );
  const doc = await pdfjs.getDocument({
    data,
    useWorkerFetch: false,
  }).promise;

  const pageTexts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: { str: string; x: number; y: number }[] = [];
    for (const rawItem of content.items) {
      if ('str' in rawItem && 'transform' in rawItem) {
        items.push({
          str: rawItem.str,
          x: Number(rawItem.transform[4] ?? 0),
          y: Number(rawItem.transform[5] ?? 0),
        });
      }
    }
    pageTexts.push(groupPdfTextItemsIntoLines(items).join('\n'));
  }

  const fullText = pageTexts.join('\n');
  assert.equal(isOfficialHskText(fullText), true);
  const parsed = parseOfficialHskText(fullText);

  assert.equal(parsed.skippedLines.length, 0);
  assert.equal(parsed.rows.length, 1000);
  assert.equal(parsed.levelCounts[1], 300);
  assert.equal(parsed.levelCounts[2], 200);
  assert.equal(parsed.levelCounts[3], 500);

  const missingGlossary = parsed.rows.filter((r) => r.translation.startsWith('['));
  assert.equal(
    missingGlossary.length,
    0,
    `Missing glossary entries: ${missingGlossary.map((m) => `${m.index}:${m.hanzi}`).join(', ')}`
  );
});
