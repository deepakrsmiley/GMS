const express = require('express');
const router = express.Router();
const {
  createChangeRequest,
  getChangeRequests,
  getChangeRequest,
  reviewChangeRequest,
  getPendingMedicineLocks,
} = require('../controllers/changeRequestController');
const { protect, authorizeAnyPermission } = require('../middleware/auth');

router.use(protect);

const VIEW_CR = authorizeAnyPermission('VIEW_CHANGE_REQUESTS', 'CREATE_CHANGE_REQUEST', 'REVIEW_CHANGE_REQUESTS');
const CREATE_CR = authorizeAnyPermission('CREATE_CHANGE_REQUEST');
const REVIEW_CR = authorizeAnyPermission('REVIEW_CHANGE_REQUESTS');

router.route('/')
  .get(VIEW_CR, getChangeRequests)
  .post(CREATE_CR, createChangeRequest);

// Must be before /:id
router.get('/medicine-locks', VIEW_CR, getPendingMedicineLocks);

router.get('/:id', VIEW_CR, getChangeRequest);
router.put('/:id/review', REVIEW_CR, reviewChangeRequest);

module.exports = router;
