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
const { authenticateUser, authorizeAnyPermission } = require('../middleware/auth');

router.use(authenticateUser);

const MANAGE_DEPT = authorizeAnyPermission('MANAGE_DEPARTMENTS');

router.route('/')
  .get(getDepartments)
  .post(MANAGE_DEPT, createDepartment);

router.route('/:id')
  .get(getDepartment)
  .put(MANAGE_DEPT, updateDepartment)
  .delete(MANAGE_DEPT, deleteDepartment);

router.put('/:id/toggle', MANAGE_DEPT, toggleDepartmentStatus);

module.exports = router;
