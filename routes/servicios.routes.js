const express = require('express');
const router = express.Router();
const { registrarServicio, obtenerServicios, actualizarServicio, eliminarServicio } = require('../controllers/servicios.controller');
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');

router.post('/registrar', verificarToken, verificarRol(['1']), registrarServicio);
router.put('/:id', verificarToken, verificarRol(['1']), actualizarServicio);
router.delete('/:id', verificarToken, verificarRol(['1']), eliminarServicio);

router.get('/', verificarToken, obtenerServicios);

module.exports = router;