const express = require('express');
const router = express.Router();
const { registrarServicio, obtenerServicios, eliminarServicio } = require('../controllers/servicios.controller');
const { verificarToken } = require('../middlewares/auth.middleware');

router.post('/registrar', verificarToken, registrarServicio);
router.get('/', verificarToken, obtenerServicios);
router.delete('/:id', eliminarServicio);

module.exports = router;