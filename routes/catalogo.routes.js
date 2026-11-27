const express = require('express');
const router = express.Router();
const { listarCategorias, crearCategoria, listarProductos, crearProducto, actualizarProducto, subirImagen, quitarImagen, registrarVentaRapida, listarVentas, cambiarEstadoVenta } = require('../controllers/catalogo.controller');
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');

// Bloqueamos la creación y edición de inventario al administrador
router.post('/categorias', verificarToken, verificarRol(['1']), crearCategoria);
router.post('/productos', verificarToken, verificarRol(['1']), crearProducto);
router.put('/productos/:id', verificarToken, verificarRol(['1']), actualizarProducto);

// Foto del producto: llega como archivo binario (el panel la reduce antes de enviarla)
const leerImagen = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' });
router.put('/productos/:id/imagen', verificarToken, verificarRol(['1']), leerImagen, subirImagen);
router.delete('/productos/:id/imagen', verificarToken, verificarRol(['1']), quitarImagen);

// Consultar catálogo: cualquier usuario con sesión. Registrar ventas: solo admin
router.get('/categorias', verificarToken, listarCategorias);
router.get('/productos', verificarToken, listarProductos);
router.get('/ventas', verificarToken, verificarRol(['1']), listarVentas);
router.post('/ventas', verificarToken, verificarRol(['1']), registrarVentaRapida);
router.put('/ventas/:id/estado', verificarToken, verificarRol(['1']), cambiarEstadoVenta);

module.exports = router;