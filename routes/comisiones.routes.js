const express = require('express');
const router = express.Router();
const {
    listarComisiones,
    calcularDesdeCitasCompletadas,
    marcarComisionPagada,
    liquidarPendientesBarbero
} = require('../controllers/comisiones.controller');
const { verificarToken } = require('../middlewares/auth.middleware');

router.get('/', verificarToken, listarComisiones);
router.post('/calcular-citas', verificarToken, calcularDesdeCitasCompletadas);
router.put('/:id/pagar', verificarToken, marcarComisionPagada);
router.put('/liquidar-barbero', verificarToken, liquidarPendientesBarbero);

module.exports = router;