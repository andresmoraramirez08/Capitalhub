// =============================================================================
// CapitalHub - Rutas del portal del cliente: /api/portal/...
// Públicas (sin token): catálogos, horarios y agendar como invitado.
// Solo cliente (rol 3): sus citas, cancelar y reprogramar.
// =============================================================================
const express = require('express');
const router = express.Router();
const {
    obtenerServicios, obtenerBarberos, obtenerProductos, horariosDisponibles,
    agendarCita, misCitas, cancelarMiCita, reprogramarMiCita
} = require('../controllers/portal.controller');
const { verificarToken, verificarRol, verificarTokenOpcional } = require('../middlewares/auth.middleware');
const { limitarPeticiones } = require('../middlewares/limite.middleware');

// Públicas
router.get('/servicios', obtenerServicios);
router.get('/barberos', obtenerBarberos);
router.get('/productos', obtenerProductos);
router.post('/horarios-disponibles', limitarPeticiones({ max: 120, ventanaMin: 15 }), verificarTokenOpcional, horariosDisponibles);

// Agendar: invitado (sin token) o cliente con sesión
router.post('/citas', limitarPeticiones({ max: 10, ventanaMin: 60 }), verificarTokenOpcional, agendarCita);

// Solo el cliente dueño de la cita
router.get('/mis-citas', verificarToken, verificarRol(['3']), misCitas);
router.put('/mis-citas/:id/cancelar', verificarToken, verificarRol(['3']), cancelarMiCita);
router.put('/mis-citas/:id/reprogramar', verificarToken, verificarRol(['3']), reprogramarMiCita);

module.exports = router;
