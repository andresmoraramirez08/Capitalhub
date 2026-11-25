const express = require('express');
const router = express.Router();
const { listarClientes, obtenerHistorialCliente,crearClienteRapido } = require('../controllers/clientes.controller');
const { verificarToken } = require('../middlewares/auth.middleware');

router.get('/', verificarToken, listarClientes);
router.post('/', verificarToken, crearClienteRapido);
router.get('/:telefono/historial', verificarToken, obtenerHistorialCliente);

module.exports = router;