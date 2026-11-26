const express = require('express');
const router = express.Router();
const { listarClientes, obtenerHistorialCliente, crearClienteRapido } = require('../controllers/clientes.controller');
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');

// Todo el módulo de clientes es exclusivo del administrador
router.get('/', verificarToken, verificarRol(['1']), listarClientes);
router.post('/', verificarToken, verificarRol(['1']), crearClienteRapido);
router.get('/:id/historial', verificarToken, verificarRol(['1']), obtenerHistorialCliente);

module.exports = router;