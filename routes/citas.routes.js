const express = require('express');
const router = express.Router();
const { agendarCita } = require('../controllers/citas.controller');

// Ruta para crear una nueva cita (POST /api/citas)
router.post('/', agendarCita);

module.exports = router;