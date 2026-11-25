const express = require('express');
const router = express.Router();
const { registrarBarbero, obtenerBarberos, eliminarBarbero, actualizarBarbero} = require('../controllers/barberos.controller');
const { verificarToken } = require('../middlewares/auth.middleware');

router.post('/registrar', verificarToken, registrarBarbero);
router.get('/', verificarToken, obtenerBarberos);
router.delete('/:id', verificarToken, eliminarBarbero); // <-- Ruta de eliminar lista
router.put('/:id', verificarToken, actualizarBarbero);

module.exports = router;