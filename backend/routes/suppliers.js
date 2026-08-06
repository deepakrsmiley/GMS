console.log('SUPPLIERS ROUTE LOADED');

const express = require('express');
const router = express.Router();

const {
  getSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} = require('../controllers/supplierController');

const { authenticateUser, authorizeAnyPermission } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Supplier = require('../models/Supplier');

router.use(authenticateUser);

const VIEW_SUPPLIERS = authorizeAnyPermission('MANAGE_SUPPLIERS', 'MANAGE_PHARMACY', 'VIEW_PHARMACY');
const MANAGE_SUPPLIERS = authorizeAnyPermission('MANAGE_SUPPLIERS', 'MANAGE_PHARMACY');

router.route('/')
  .get(VIEW_SUPPLIERS, advancedResults(Supplier), getSuppliers)
  .post(MANAGE_SUPPLIERS, createSupplier);

router.route('/:id')
  .get(VIEW_SUPPLIERS, getSupplier)
  .put(MANAGE_SUPPLIERS, updateSupplier)
  .delete(MANAGE_SUPPLIERS, deleteSupplier);

module.exports = router;
