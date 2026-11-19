const express = require('express');
const router = express.Router();
const { obtenerResumen } = require('../controllers/dashboard.controller');
const { verificarToken } = require('../middleware/auth.middleware');

// Ruta protegida por JWT
router.get('/resumen', verificarToken, obtenerResumen);

module.exports = router;