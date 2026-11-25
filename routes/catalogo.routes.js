const express = require('express');
const router = express.Router();
const {
    listarCategorias,
    crearCategoria,
    listarProductos,
    crearProducto,
    actualizarProducto,
    registrarVentaRapida,
    listarVentas,
    cambiarEstadoVenta
} = require('../controllers/catalogo.controller');
const { verificarToken } = require('../middlewares/auth.middleware');

router.get('/categorias', verificarToken, listarCategorias);
router.post('/categorias', verificarToken, crearCategoria);

router.get('/productos', verificarToken, listarProductos);
router.post('/productos', verificarToken, crearProducto);
router.put('/productos/:id', verificarToken, actualizarProducto);

router.get('/ventas', verificarToken, listarVentas);
router.post('/ventas', verificarToken, registrarVentaRapida);
router.put('/ventas/:id/estado', verificarToken, cambiarEstadoVenta);

module.exports = router;