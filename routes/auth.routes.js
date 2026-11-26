const express = require('express');
const router = express.Router();
const { login, registro } = require('../controllers/auth.controller');
const { limitarPeticiones } = require('../middlewares/limite.middleware');

// Ruta para iniciar sesión: POST /api/auth/login (admin, barbero y cliente)
router.post('/login', limitarPeticiones({ max: 20, ventanaMin: 15 }), login);

// Registro de clientes desde el portal (siempre rol 3): POST /api/auth/registro
router.post('/registro', limitarPeticiones({ max: 5, ventanaMin: 60 }), registro);

module.exports = router;