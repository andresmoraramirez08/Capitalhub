const express = require('express');
const router = express.Router();
const {
    registrarBarbero, obtenerBarberos, eliminarBarbero, actualizarBarbero,
    crearCuentaBarbero, cambiarContrasenaBarbero, quitarCuentaBarbero
} = require('../controllers/barberos.controller');
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');

// Crear, editar y eliminar es solo para Admin (Rol 1)
router.post('/registrar', verificarToken, verificarRol(['1']), registrarBarbero);
router.put('/:id', verificarToken, verificarRol(['1']), actualizarBarbero);
router.delete('/:id', verificarToken, verificarRol(['1']), eliminarBarbero);

// Acceso al sistema del barbero (cuenta enlazada): solo Admin
router.post('/:id/cuenta', verificarToken, verificarRol(['1']), crearCuentaBarbero);
router.put('/:id/cuenta', verificarToken, verificarRol(['1']), cambiarContrasenaBarbero);
router.delete('/:id/cuenta', verificarToken, verificarRol(['1']), quitarCuentaBarbero);

// Obtener barberos lo pueden ver todos los logueados para poder agendar citas
router.get('/', verificarToken, obtenerBarberos);

module.exports = router;