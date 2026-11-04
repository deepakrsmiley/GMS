/**
 * Clear outstanding bill dues for Srinivasa hospital only.
 * Sets due to 0 and marks the bill paid. Does not add a payment dated today,
 * so today's cash collection is not increased.
 *
 * Dry-run: node scripts/clearSrinivasaPendingDues.js
 * Apply:   node scripts/clearSrinivasaPendingDues.js --apply --confirm YES
 */
require('dotenv').config();

const mongoose = require('mongoose');
const Bill = require('../models/Bill');
const DirectSale = require('../models/DirectSale');
const Organization = require('../models/Organization');

const round2 = (n) => Number((Number(n) || 0).toFixed(2));

async function main() {
  const apply = process.argv.includes('--apply');
  const confirm = process.argv.includes('--confirm')
    && process.argv[process.argv.indexOf('--confirm') + 1] === 'YES';
  if (apply && !confirm) {
    console.error('Refusing to write. Use: --apply --confirm YES');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI, { family: 4 });
  const orgs = await Organization.find().lean();
  const srinivasa = orgs.find((org) => /srinivasa/i.test(`${org.name} ${org.code}`));
  if (!srinivasa) throw new Error('Srinivasa organization not found');

  const orgId = srinivasa._id;
  const skip = { skipOrganizationFilter: true };
  const billQuery = {
    organizationId: orgId,
    status: { $nin: ['cancelled', 'refunded', 'draft'] },
    $or: [
      { status: { $in: ['pending', 'partial'] } },
      { dueAmount: { $gt: 0 } },
    ],
  };

  const bills = await Bill.find(billQuery)
    .setOptions(skip)
    .select('billNumber status totalAmount paidAmount advanceAmount dueAmount billType')
    .lean();

  const sales = await DirectSale.find({
    organizationId: orgId,
    paymentStatus: { $in: ['pending', 'partial'] },
  }).setOptions(skip).select('invoiceNumber paymentStatus grandTotal paidAmount').lean();

  const otherDue = await Bill.aggregate([
    {
      $match: {
        organizationId: { $ne: orgId },
        status: { $in: ['pending', 'partial'] },
      },
    },
    { $group: { _id: '$organizationId', count: { $sum: 1 }, due: { $sum: '$dueAmount' } } },
  ]).option(skip);

  let dueSum = 0;
  const byStatus = {};
  bills.forEach((bill) => {
    const due = round2(bill.dueAmount);
    dueSum = round2(dueSum + due);
    const key = bill.status || 'unknown';
    if (!byStatus[key]) byStatus[key] = { count: 0, due: 0 };
    byStatus[key].count += 1;
    byStatus[key].due = round2(byStatus[key].due + due);
  });

  console.log(`Hospital: ${srinivasa.name} (${srinivasa.code})`);
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Bills to clear: ${bills.length}`);
  console.log(`Due amount to clear: ${dueSum}`);
  Object.entries(byStatus).forEach(([status, row]) => {
    console.log(`  ${status}: ${row.count} bills, due ${row.due}`);
  });
  const saleDue = sales.reduce((sum, sale) => sum + Math.max(0, round2(sale.grandTotal) - round2(sale.paidAmount)), 0);
  console.log(`Pharmacy counter sales still open: ${sales.length}, due ${round2(saleDue)}`);
  console.log(`Other hospitals pending bills (must stay): ${otherDue.map((row) => `${row.count}/${round2(row.due)}`).join(', ') || 'none'}`);

  if (!apply) {
    console.log('\nDry-run only. To write:');
    console.log('  node scripts/clearSrinivasaPendingDues.js --apply --confirm YES');
    await mongoose.disconnect();
    return;
  }

  const now = new Date();
  let updated = 0;
  for (const bill of bills) {
    const total = round2(bill.totalAmount);
    const advance = round2(bill.advanceAmount);
    const paid = round2(bill.paidAmount);
    const due = round2(bill.dueAmount);
    const neededPaid = Math.max(paid, round2(Math.max(0, total - advance)), round2(paid + due));
    await Bill.updateOne(
      { _id: bill._id, organizationId: orgId },
      {
        $set: {
          paidAmount: neededPaid,
          dueAmount: 0,
          status: 'paid',
        },
        $push: {
          editHistory: {
            billNumber: bill.billNumber,
            editTime: now,
            actionType: 'Due cleared',
            field: 'dueAmount',
            previousValue: due,
            newValue: 0,
            reason: 'Pending due cleared for Srinivasa hospital',
          },
        },
      },
    ).setOptions(skip);
    updated += 1;
  }

  let salesUpdated = 0;
  for (const sale of sales) {
    const total = round2(sale.grandTotal);
    await DirectSale.updateOne(
      { _id: sale._id, organizationId: orgId },
      { $set: { paidAmount: total, paymentStatus: 'paid' } },
    ).setOptions(skip);
    salesUpdated += 1;
  }

  const left = await Bill.countDocuments({
    organizationId: orgId,
    status: { $in: ['pending', 'partial'] },
  }).setOptions(skip);
  const leftDue = await Bill.aggregate([
    { $match: { organizationId: orgId, status: { $nin: ['cancelled', 'refunded', 'draft'] }, dueAmount: { $gt: 0 } } },
    { $group: { _id: null, due: { $sum: '$dueAmount' }, count: { $sum: 1 } } },
  ]).option(skip);
  const otherAfter = await Bill.aggregate([
    {
      $match: {
        organizationId: { $ne: orgId },
        status: { $in: ['pending', 'partial'] },
      },
    },
    { $group: { _id: '$organizationId', count: { $sum: 1 }, due: { $sum: '$dueAmount' } } },
  ]).option(skip);

  const beforeKey = JSON.stringify(otherDue.map((row) => [String(row._id), row.count, round2(row.due)]).sort());
  const afterKey = JSON.stringify(otherAfter.map((row) => [String(row._id), row.count, round2(row.due)]).sort());
  if (beforeKey !== afterKey) {
    throw new Error('Another hospital pending dues changed');
  }

  console.log(`Updated bills: ${updated}`);
  console.log(`Updated counter sales: ${salesUpdated}`);
  console.log(`Srinivasa pending/partial bills left: ${left}`);
  console.log(`Srinivasa due left: ${leftDue[0] ? `${leftDue[0].count} bills, ${round2(leftDue[0].due)}` : '0'}`);
  console.log('Other hospitals unchanged.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});
