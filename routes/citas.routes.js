const express = require('express');
const router = express.Router();
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');
const { agendarCita, obtenerHorariosDisponibles, obtenerMisCitas, obtenerTodasLasCitasHoy, obtenerCitasPorFecha, cambiarEstado, reprogramarCita } = require('../controllers/citas.controller');

// Barberos y admin usan estas rutas; el controlador limita al barbero a su propia agenda
router.post('/', verificarToken, agendarCita);
router.post('/horarios-disponibles', verificarToken, obtenerHorariosDisponibles);
router.post('/mis-citas', verificarToken, obtenerMisCitas);
router.post('/todas-hoy', verificarToken, verificarRol(['1']), obtenerTodasLasCitasHoy); // agenda de todos: solo admin
router.post('/por-fecha', verificarToken, obtenerCitasPorFecha);
router.put('/:id/estado', verificarToken, cambiarEstado);
router.put('/:id/reprogramar', verificarToken, reprogramarCita);

module.exports = router;