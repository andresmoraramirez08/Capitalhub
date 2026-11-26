// =============================================================================
// CapitalHub - Rutas de la tienda en línea: /api/tienda/...
// =============================================================================
const express = require('express');
const router = express.Router();
const { configTienda, crearPedido, verPedido, reanudarPago, webhookMercadoPago, misPedidos } = require('../controllers/tienda.controller');
const { verificarToken, verificarRol, verificarTokenOpcional } = require('../middlewares/auth.middleware');
const { limitarPeticiones } = require('../middlewares/limite.middleware');

router.get('/config', configTienda);
router.post('/pedidos', limitarPeticiones({ max: 20, ventanaMin: 60 }), verificarTokenOpcional, crearPedido);
router.get('/pedidos/:id', limitarPeticiones({ max: 120, ventanaMin: 15 }), verPedido);
router.post('/pedidos/:id/pagar', limitarPeticiones({ max: 10, ventanaMin: 15 }), reanudarPago);
router.post('/webhook-mercadopago', webhookMercadoPago);
router.get('/mis-pedidos', verificarToken, verificarRol(['3']), misPedidos);

module.exports = router;
