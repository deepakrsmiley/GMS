const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const {
  asObjectId,
  sanitizeBillItems,
  inferBillType,
  pickIpAdmissionId,
} = require('../utils/billItems');

const oid = () => new mongoose.Types.ObjectId();

describe('asObjectId', () => {
  it('accepts lowercase and uppercase hex ids', () => {
    const id = oid();
    const lower = String(id);
    const upper = lower.toUpperCase();
    assert.equal(String(asObjectId(lower)), lower);
    assert.equal(String(asObjectId(upper)), lower);
    assert.equal(String(asObjectId({ _id: id })), lower);
  });

  it('drops invalid values instead of throwing', () => {
    assert.equal(asObjectId(undefined), undefined);
    assert.equal(asObjectId('not-an-id'), undefined);
    assert.equal(asObjectId('IPAdmission'), undefined);
  });
});

describe('sanitizeBillItems', () => {
  it('keeps IP medication referenceModel so stock is not deducted twice', () => {
    const admissionId = oid();
    const medId = oid();
    const [line] = sanitizeBillItems([{
      category: 'Pharmacy',
      type: 'medicine',
      description: 'ETHILON-3.0',
      quantity: 1,
      unitPrice: 120,
      medicine: medId,
      referenceId: admissionId,
      referenceModel: 'IPAdmission',
      availableStock: 0,
    }]);
    assert.equal(line.referenceModel, 'IPAdmission');
    assert.equal(String(line.referenceId), String(admissionId));
    assert.equal(String(line.medicine), String(medId));
    assert.equal(line.availableStock, undefined);
  });
});

describe('inferBillType', () => {
  it('stores IP-tab charges as ip even if the client sent unified', () => {
    const items = [{
      type: 'room',
      category: 'Room',
      referenceModel: 'IPAdmission',
    }];
    assert.equal(inferBillType('unified', items), 'ip');
    assert.equal(inferBillType(undefined, items), 'ip');
    assert.equal(inferBillType('ip', items), 'ip');
  });

  it('leaves OP bills unchanged', () => {
    assert.equal(inferBillType('op', [{ type: 'consultation' }]), 'op');
    assert.equal(inferBillType('unified', [{ type: 'consultation' }]), 'unified');
  });
});

describe('pickIpAdmissionId', () => {
  it('uses the admission/room line, not a medication subdocument id', () => {
    const admissionId = oid();
    const medicationSubId = oid();
    const picked = pickIpAdmissionId([
      { type: 'medicine', referenceModel: 'IPAdmission', referenceId: medicationSubId },
      { type: 'room', category: 'Room', referenceModel: 'IPAdmission', referenceId: admissionId },
    ]);
    assert.equal(String(picked), String(admissionId));
  });
});
