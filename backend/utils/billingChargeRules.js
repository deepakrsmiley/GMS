/** Pure billing charge rules (no DB). */

const filterChargesForBillType = (charges, billType) => {
  const mode = billType || 'auto';
  if (mode === 'lab') {
    return charges.filter((c) => c.category === 'Laboratory' || c.type === 'lab');
  }
  if (mode === 'op') {
    return charges.filter((c) => c.category !== 'Pharmacy' && c.type !== 'medicine');
  }
  return charges;
};

const isCancelledLabOrder = (lab) => String(lab?.status || '') === 'cancelled';

const labBillableTestLines = (lab) => {
  if (!lab || isCancelledLabOrder(lab)) return [];
  const labNumber = lab.labNumber || '';
  const tests = Array.isArray(lab.tests) ? lab.tests : [];
  const active = tests.filter(
    (t) => t && t.status !== 'cancelled' && Number(t.price) > 0,
  );
  if (active.length) {
    return active.map((test) => ({
      category: 'Laboratory',
      type: 'lab',
      description: `Lab: ${test.testName} (${labNumber})`.trim(),
      name: test.testName,
      quantity: 1,
      unitPrice: Number(test.price) || 0,
      gstPercent: 0,
      gstAmount: 0,
      totalAmount: Number(test.price) || 0,
      referenceId: lab._id,
      referenceModel: 'LabTest',
    }));
  }
  const fallback = Number(lab.totalAmount) || 0;
  if (fallback > 0) {
    return [{
      category: 'Laboratory',
      type: 'lab',
      description: `Lab tests (${labNumber})`.trim(),
      name: lab.testProfile || 'Lab tests',
      quantity: 1,
      unitPrice: fallback,
      gstPercent: 0,
      gstAmount: 0,
      totalAmount: fallback,
      referenceId: lab._id,
      referenceModel: 'LabTest',
    }];
  }
  return [];
};

const labOrderPayableTotal = (lab) =>
  labBillableTestLines(lab).reduce((sum, line) => sum + Number(line.totalAmount || 0), 0);

module.exports = {
  filterChargesForBillType,
  labBillableTestLines,
  labOrderPayableTotal,
  isCancelledLabOrder,
};
