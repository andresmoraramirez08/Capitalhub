const express = require('express');
const router = express.Router();
const {
    registrarServicio,
    obtenerServicios,
    actualizarServicio,
    eliminarServicio
} = require('../controllers/servicios.controller');
const { verificarToken } = require('../middlewares/auth.middleware');

router.post('/registrar', verificarToken, registrarServicio);
router.get('/', verificarToken, obtenerServicios);
router.put('/:id', verificarToken, actualizarServicio);
router.delete('/:id', verificarToken, eliminarServicio);

module.exports = router;