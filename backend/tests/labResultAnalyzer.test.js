const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  analyzeResult,
  tidyRangeText,
  tidyTestName,
  labSectionRank,
} = require('../utils/labResultAnalyzer');

describe('lab report sheet', () => {
  it('prints less-than ranges with a symbol', () => {
    assert.equal(tidyRangeText('Less than 140'), '<140');
    assert.equal(tidyRangeText('upto 200'), '<200');
    assert.equal(tidyRangeText('less than 190mg/dl'), '<190');
  });

  it('corrects the post prandial spelling', () => {
    assert.equal(tidyTestName('Post Prandian Blood Sugar'), 'Post Prandial Blood Sugar');
    assert.equal(tidyTestName('post prardian'), 'Post Prandial');
  });

  it('flags a value that is not below the symbol range', () => {
    const high = analyzeResult({ value: '140', referenceRange: '<140' });
    assert.equal(high.flag, 'HIGH');
    const ok = analyzeResult({ value: '139', referenceRange: 'Less than 140' });
    assert.equal(ok.flag, 'NORMAL');
    assert.equal(ok.displayRange, '<140');
  });

  it('highlights urine words such as trace and present plus', () => {
    assert.equal(analyzeResult({ value: 'Trace' }).flag, 'ABNORMAL');
    assert.equal(analyzeResult({ value: 'Present(++)' }).flag, 'ABNORMAL');
    assert.equal(analyzeResult({ value: '+++' }).flag, 'ABNORMAL');
    assert.equal(analyzeResult({ value: 'Nil' }).flag, 'NORMAL');
  });

  it('uses the male, female, or child band for a hemogram value', () => {
    const range = 'M:13–17; F:12–15; C:11–16';
    assert.equal(analyzeResult({ value: '14', referenceRange: range, patient: { age: 30, gender: 'Male' } }).flag, 'NORMAL');
    assert.equal(analyzeResult({ value: '11', referenceRange: range, patient: { age: 30, gender: 'Female' } }).flag, 'LOW');
    assert.equal(analyzeResult({ value: '12', referenceRange: range, patient: { age: 8, gender: 'Male' } }).displayRange, '11–16');
  });

  it('keeps the printed block order from the sheet', () => {
    assert.ok(labSectionRank('CBC') < labSectionRank('Sugar Profile'));
    assert.ok(labSectionRank('Lipid Profile') < labSectionRank('RFT'));
    assert.ok(labSectionRank('LFT') < labSectionRank('Bilirubin'));
    assert.ok(labSectionRank('Bilirubin') < labSectionRank('Urine Routine'));
  });
});
