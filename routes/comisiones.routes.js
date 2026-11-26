const express = require('express');
const router = express.Router();
const { listarComisiones, calcularDesdeCitasCompletadas, marcarComisionPagada, liquidarPendientesBarbero } = require('../controllers/comisiones.controller');
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');

// Consultar: admin y barbero (el barbero solo las suyas). Calcular y pagar: solo admin
router.get('/', verificarToken, verificarRol(['1', '2']), listarComisiones); // el barbero solo ve las suyas
router.post('/calcular-citas', verificarToken, verificarRol(['1']), calcularDesdeCitasCompletadas);
router.put('/:id/pagar', verificarToken, verificarRol(['1']), marcarComisionPagada);
router.put('/liquidar-barbero', verificarToken, verificarRol(['1']), liquidarPendientesBarbero);

module.exports = router;