const express = require('express');
const router = express.Router();
const { obtenerResumen } = require('../controllers/dashboard.controller');
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');

// Solo el admin ve el resumen total de ingresos de la barbería
router.get('/resumen', verificarToken, verificarRol(['1']), obtenerResumen);

module.exports = router;