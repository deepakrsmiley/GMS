const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const purchaseService = require('../services/purchaseService');

const run = (fn, status = 200) => asyncHandler(async (req, res, next) => {
  try {
    const data = await fn(req);
    res.status(status).json({ success: true, data });
  } catch (err) {
    next(new ErrorResponse(err.message || 'Purchase request failed', err.statusCode || 500));
  }
});

exports.getMeta = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: { reasons: purchaseService.RETURN_REASONS },
  });
});

exports.createPurchase = run((req) => purchaseService.createPurchase(req), 201);
exports.listPurchases = run((req) => purchaseService.listPurchases(req.query));
exports.getPurchase = run((req) => purchaseService.getPurchase(req.params.id));
exports.updatePurchase = run((req) => purchaseService.updatePurchaseHeader(req));
exports.cancelPurchase = run((req) => purchaseService.cancelPurchase(req));
exports.previewReturn = run((req) => purchaseService.previewReturn(req));
exports.createReturn = run((req) => purchaseService.createReturn(req), 201);
exports.listReturns = run((req) => purchaseService.listReturns(req.query));
exports.getReturn = run((req) => purchaseService.getReturn(req.params.id));
exports.cancelReturn = run((req) => purchaseService.cancelReturn(req));
exports.getLedger = run((req) => purchaseService.getLedger(req.query));
exports.getValuation = run((req) => purchaseService.getValuation(req.query));
exports.getReports = run((req) => purchaseService.getReports(req.query));
exports.getDashboardCards = run(() => purchaseService.getDashboardCards());
