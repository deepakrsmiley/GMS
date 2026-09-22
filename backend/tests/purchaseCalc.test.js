const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  calcLine,
  summarizePurchase,
  returnValue,
  returnableQuantity,
  assertReturnQuantity,
  effectiveUnitCost,
  parseExpiry,
  stockValue,
} = require('../utils/purchaseCalc');
const { receivePurchaseBatch } = require('../utils/pharmacyStockHelper');

describe('purchase calculations', () => {
  it('values a simple purchase at quantity times rate', () => {
    const line = calcLine({ quantity: 100, purchaseRate: 5, gstPercent: 0 });
    assert.equal(line.grossAmount, 500);
    assert.equal(line.lineTotal, 500);
  });

  it('applies item discount then GST without using selling price', () => {
    const summary = summarizePurchase([
      { quantity: 100, purchaseRate: 5, discount: 50, gstPercent: 12 },
    ], 0, 'intra');
    assert.equal(summary.grossPurchaseValue, 500);
    assert.equal(summary.netPurchaseValue, 450);
    assert.equal(summary.taxAmount, 54);
    assert.equal(summary.cgstTotal, 27);
    assert.equal(summary.sgstTotal, 27);
    assert.equal(summary.grandTotal, 504);
  });

  it('uses interstate IGST when configured', () => {
    const summary = summarizePurchase([
      { quantity: 100, purchaseRate: 5, discount: 50, gstPercent: 12 },
    ], 0, 'inter');
    assert.equal(summary.igstTotal, 54);
    assert.equal(summary.cgstTotal, 0);
  });

  it('keeps free quantity out of the invoice rate', () => {
    const line = calcLine({ quantity: 100, purchaseRate: 5 });
    assert.equal(line.grossAmount, 500);
    assert.equal(effectiveUnitCost(500, 110), 4.5455);
    assert.equal(line.purchaseRate, 5);
  });

  it('returns stock at the purchase rate, not the selling price', () => {
    const sellingPrice = 8;
    const purchaseRate = 5;
    assert.equal(returnValue(20, purchaseRate), 100);
    assert.notEqual(returnValue(20, purchaseRate), 20 * sellingPrice);
    assert.equal(stockValue(80, purchaseRate), 400);
  });

  it('allows partial returns until the purchased quantity is exhausted', () => {
    const first = returnableQuantity({ purchasedQty: 500, returnedQty: 0, batchQty: 500 });
    assert.equal(first.available, 500);
    assertReturnQuantity(50, first.available, { remainingOnInvoice: first.remainingOnInvoice });
    const second = returnableQuantity({ purchasedQty: 500, returnedQty: 50, batchQty: 450 });
    assert.equal(second.available, 450);
  });

  it('rejects a return above available quantity', () => {
    assert.throws(
      () => assertReturnQuantity(60, 50, { remainingOnInvoice: 50 }),
      (err) => err.message === 'Return quantity cannot exceed available quantity.',
    );
  });

  it('rejects a return after the invoice quantity is fully returned', () => {
    assert.throws(
      () => assertReturnQuantity(1, 0, { remainingOnInvoice: 0 }),
      (err) => err.message === 'This batch has already been fully returned.',
    );
  });

  it('parses month expiry as the end of that month', () => {
    const expiry = parseExpiry('12/2028');
    assert.equal(expiry.getFullYear(), 2028);
    assert.equal(expiry.getMonth(), 11);
    assert.equal(expiry.getDate(), 31);
  });
});

describe('purchase receipt does not overwrite selling price', () => {
  it('keeps batches separate and preserves the original purchase rate', () => {
    const medicine = {
      name: 'Dolo 650',
      sellingPrice: 8,
      purchasePrice: 3,
      mrp: 10,
      batches: [],
    };

    const first = receivePurchaseBatch(medicine, {
      batchNumber: 'D650A123',
      paidQuantity: 100,
      freeQuantity: 10,
      expiryDate: '2028-12-31',
      purchaseRate: 5,
    });
    assert.equal(medicine.sellingPrice, 8);
    assert.equal(medicine.purchasePrice, 3);
    assert.equal(first.batch.quantity, 110);
    assert.equal(first.batch.purchasePrice, 5);
    assert.equal(first.batch.sellingPrice, 8);

    receivePurchaseBatch(medicine, {
      batchNumber: 'D650A123',
      paidQuantity: 20,
      expiryDate: '2028-12-31',
      purchaseRate: 9,
    });
    assert.equal(first.batch.purchasePrice, 5);
    assert.equal(first.batch.quantity, 130);
    assert.equal(medicine.sellingPrice, 8);

    receivePurchaseBatch(medicine, {
      batchNumber: 'B2',
      paidQuantity: 200,
      expiryDate: '2027-06-30',
      purchaseRate: 5.5,
    });
    assert.equal(medicine.batches.length, 2);
    assert.equal(medicine.batches[1].purchasePrice, 5.5);
    assert.equal(medicine.batches[1].quantity, 200);
  });
});
