const express = require('express');
const router = express.Router();
const { registrarBarbero, obtenerBarberos } = require('../controllers/barberos.controller');
const { verificarToken } = require('../middleware/auth.middleware');

router.post('/registrar', verificarToken, registrarBarbero);
router.get('/', verificarToken, obtenerBarberos);

module.exports = router;    