import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsvLine,
  parseDelimitedText,
  parseJsonImport,
  parseTableRows,
  serializeToCsv,
} from './importers';

test('parseCsvLine handles quoted fields with commas and escaped quotes', () => {
  const cols = parseCsvLine('"你好","nǐ hǎo","hello, ""hi"""');
  assert.deepEqual(cols, ['你好', 'nǐ hǎo', 'hello, "hi"']);
});

test('parseDelimitedText parses pipe, tab, and CSV text with automatic header skipping', () => {
  const pipeText = `hanzi | pinyin | translation\n机场 | jīchǎng | airport\n护照 | hùzhào | passport`;
  const pipeResult = parseDelimitedText(pipeText);
  assert.equal(pipeResult.detectedDelimiter, 'pipe');
  assert.equal(pipeResult.rows.length, 2);
  assert.deepEqual(pipeResult.rows[0], {
    hanzi: '机场',
    pinyin: 'jīchǎng',
    translation: 'airport',
    notes: undefined,
  });

  const tabText = `地铁\tdìtiě\tsubway\n出租车\tchūzūchē\ttaxi\tdaily transit`;
  const tabResult = parseDelimitedText(tabText);
  assert.equal(tabResult.detectedDelimiter, 'tab');
  assert.equal(tabResult.rows.length, 2);
  assert.equal(tabResult.rows[1].notes, 'daily transit');
});

test('parseDelimitedText parses inline parenthetical format and flags malformed lines', () => {
  const text = `谢谢 (xièxie) - thank you\ninvalidSingleColumnLine\n咖啡 [kāfēi] coffee`;
  const res = parseDelimitedText(text);
  assert.equal(res.rows.length, 2);
  assert.equal(res.rows[0].hanzi, '谢谢');
  assert.equal(res.rows[0].pinyin, 'xièxie');
  assert.equal(res.rows[0].translation, 'thank you');
  assert.equal(res.skippedLines.length, 1);
  assert.equal(res.skippedLines[0].lineNumber, 2);
});

test('parseJsonImport parses array of card objects with flexible key aliases', () => {
  const json = JSON.stringify([
    { word: '电脑', pinyin: 'diànnǎo', meaning: 'computer' },
    { hanzi: '手机', pinyin: 'shǒujī', translation: 'mobile phone', notes: 'noun' },
  ]);
  const res = parseJsonImport(json);
  assert.equal(res.rows.length, 2);
  assert.equal(res.rows[0].hanzi, '电脑');
  assert.equal(res.rows[0].translation, 'computer');
  assert.equal(res.rows[1].notes, 'noun');
});

test('parseTableRows skips empty blank rows and validates partial rows', () => {
  const res = parseTableRows([
    { hanzi: '水', pinyin: 'shuǐ', translation: 'water' },
    { hanzi: '', pinyin: '', translation: '' },
    { hanzi: '茶', pinyin: '', translation: '' },
  ]);
  assert.equal(res.rows.length, 1);
  assert.equal(res.skippedLines.length, 1);
});

test('serializeToCsv round-trips through parseDelimitedText', () => {
  const csv = serializeToCsv([
    {
      id: '1',
      hanzi: '学习',
      pinyin: 'xuéxí',
      translation: 'to study, to learn',
      notes: 'HSK 1',
      groupId: 'g1',
      rightCount: 2,
      wrongCount: 1,
      lastReviewedAt: null,
      createdAt: 1000,
    },
  ]);
  const reparsed = parseDelimitedText(csv, { delimiter: 'comma' });
  assert.equal(reparsed.rows.length, 1);
  assert.equal(reparsed.rows[0].hanzi, '学习');
  assert.equal(reparsed.rows[0].translation, 'to study, to learn');
});
