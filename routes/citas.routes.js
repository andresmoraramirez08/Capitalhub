const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/auth.middleware'); 

const { agendarCita, obtenerHorariosDisponibles  } = require('../controllers/citas.controller');

// Ruta para crear una nueva cita (POST /api/citas)
router.post('/', agendarCita);
router.post('/horarios-disponibles', verificarToken, obtenerHorariosDisponibles);
module.exports = router;