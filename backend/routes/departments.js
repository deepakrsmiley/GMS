const express = require('express');
const router = express.Router();
const {
  getDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  toggleDepartmentStatus,
  deleteDepartment,
} = require('../controllers/departmentController');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');

router.use(authenticateUser);

const ADMIN_ROLES = ['Super Admin', 'Admin'];

router.route('/')
  .get(getDepartments)
  .post(authorizeRoles(...ADMIN_ROLES), createDepartment);

router.route('/:id')
  .get(getDepartment)
  .put(authorizeRoles(...ADMIN_ROLES), updateDepartment)
  .delete(authorizeRoles(...ADMIN_ROLES), deleteDepartment);

router.put('/:id/toggle', authorizeRoles(...ADMIN_ROLES), toggleDepartmentStatus);

module.exports = router;
