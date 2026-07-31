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

const { authenticateUser, authorizeRoles } = require('../middleware/auth');
const advancedResults = require('../middleware/advancedResults');
const Supplier = require('../models/Supplier');

router.use(authenticateUser);

const PHARMA_ROLES = ['Super Admin', 'Admin', 'Pharmacist'];

router.route('/')
  .get(
    authorizeRoles(...PHARMA_ROLES),
    advancedResults(Supplier),
    getSuppliers
  )
  .post(
    authorizeRoles(...PHARMA_ROLES),
    createSupplier
  );

router.route('/:id')
  .get(
    authorizeRoles(...PHARMA_ROLES),
    getSupplier
  )
  .put(
    authorizeRoles(...PHARMA_ROLES),
    updateSupplier
  )
  .delete(
    authorizeRoles(...PHARMA_ROLES),
    deleteSupplier
  );

module.exports = router;