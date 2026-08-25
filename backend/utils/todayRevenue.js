const { istDayBounds, kolkataToday } = require('./istDay');

/** India calendar day window (12:00 AM IST → next 12:00 AM IST). */
const istToday = () => istDayBounds(kolkataToday());

/**
 * Money collected on the current India calendar day.
 * Uses payment.paidAt when present so yesterday's bills paid today count today,
 * and at 12:00 AM IST the total starts at 0. Legacy bills with no payments[]
 * fall back to paidAmount only if the bill was created today.
 */
const todayCollectedAddFields = (from, to) => ({
  $addFields: {
    _todayCollected: {
      $let: {
        vars: { pays: { $ifNull: ['$payments', []] } },
        in: {
          $cond: [
            { $gt: [{ $size: '$$pays' }, 0] },
            {
              $sum: {
                $map: {
                  input: {
                    $filter: {
                      input: '$$pays',
                      as: 'p',
                      cond: {
                        $and: [
                          { $gte: ['$$p.paidAt', from] },
                          { $lt: ['$$p.paidAt', to] },
                        ],
                      },
                    },
                  },
                  as: 'p',
                  in: { $ifNull: ['$$p.amount', 0] },
                },
              },
            },
            {
              $cond: [
                {
                  $and: [
                    { $gte: ['$createdAt', from] },
                    { $lt: ['$createdAt', to] },
                    { $in: ['$status', ['paid', 'partial']] },
                  ],
                },
                { $ifNull: ['$paidAmount', 0] },
                0,
              ],
            },
          ],
        },
      },
    },
  },
});

const aggregateTodayRevenue = async (BillModel, extraMatch = {}, options = {}) => {
  const { from, to } = istToday();
  const pipeline = [
    {
      $match: {
        status: { $nin: ['cancelled', 'draft', 'refunded'] },
        ...extraMatch,
      },
    },
    todayCollectedAddFields(from, to),
    { $group: { _id: null, total: { $sum: '$_todayCollected' } } },
  ];
  const query = BillModel.aggregate(pipeline);
  if (options.skipOrganizationFilter) query.option({ skipOrganizationFilter: true });
  const rows = await query;
  return rows[0]?.total || 0;
};

module.exports = {
  istToday,
  todayCollectedAddFields,
  aggregateTodayRevenue,
};
