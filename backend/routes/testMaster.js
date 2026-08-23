const express = require('express');
const router = express.Router();
const { getTests, lookupTest, createTest, updateTest, deleteTest } = require('../controllers/testMasterController');
const { protect, authorizeAnyPermission } = require('../middleware/auth');

router.use(protect);

const VIEW_TESTS = authorizeAnyPermission(
  'VIEW_LAB',
  'CREATE_LAB_ORDER',
  'MANAGE_LAB_TESTS',
  'VIEW_NURSE_STATION',
  'CREATE_CONSULTATION',
);
const MANAGE_TESTS = authorizeAnyPermission('MANAGE_LAB_TESTS', 'MANAGE_MASTERS', 'UPDATE_LAB_REPORT');

router.get('/lookup', VIEW_TESTS, lookupTest);

router.route('/')
  .get(VIEW_TESTS, getTests)
  .post(MANAGE_TESTS, createTest);

router.route('/:id')
  .put(MANAGE_TESTS, updateTest)
  .delete(MANAGE_TESTS, deleteTest);

module.exports = router;
