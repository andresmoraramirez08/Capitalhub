const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth.middleware'); 
const {
    agendarCita,
    obtenerHorariosDisponibles,
    obtenerMisCitas,
    obtenerTodasLasCitasHoy,
    obtenerCitasPorFecha,
    cambiarEstado
} = require('../controllers/citas.controller');

router.post('/', agendarCita);
router.post('/horarios-disponibles', verificarToken, obtenerHorariosDisponibles);
router.post('/mis-citas', verificarToken, obtenerMisCitas);
router.post('/todas-hoy', verificarToken, obtenerTodasLasCitasHoy);
router.post('/por-fecha', verificarToken, obtenerCitasPorFecha);
router.put('/:id/estado', verificarToken, cambiarEstado);

module.exports = router;