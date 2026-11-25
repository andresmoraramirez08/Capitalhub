const express = require('express');
const router = express.Router();
const { configurarHorario, obtenerHorario } = require('../controllers/horarios.controller');
const { verificarToken } = require('../middlewares/auth.middleware');

router.post('/', verificarToken, configurarHorario);
router.get('/:barbero_id', verificarToken, obtenerHorario);

module.exports = router; // <-- Si falta esta línea, truena exactamente con ese error