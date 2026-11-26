const express = require('express');
const router = express.Router();
const { configurarHorario, obtenerHorario } = require('../controllers/horarios.controller');
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');

router.post('/', verificarToken, verificarRol(['1']), configurarHorario);
router.get('/:barbero_id', verificarToken, verificarRol(['1']), obtenerHorario);

module.exports = router;