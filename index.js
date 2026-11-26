const express = require('express');
const cors = require('cors');
const path = require('path');
// Importar tus rutas
require('dotenv').config();
const authRoutes = require('./routes/auth.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const barberosRoutes = require('./routes/barberos.routes'); // Tu nueva ruta
const serviciosRoutes = require('./routes/servicios.routes');
const citasRoutes = require('./routes/citas.routes');

const app = express();

// 1. PRIMERO LOS MIDDLEWARES (Lectores de datos)
app.use(cors());
app.use(express.json()); // <-- ESTA LÍNEA ES LA QUE TRADUCE EL FORMULARIO
app.use(express.static(path.join(__dirname, 'frontend')));

// 2. DESPUÉS LAS RUTAS
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/barberos', barberosRoutes);
app.use('/api/servicios', serviciosRoutes);
app.use('/api/citas', citasRoutes);
app.use('/api/horarios', require('./routes/horarios.routes'));
app.use('/api/clientes', require('./routes/clientes.routes'));
app.use('/api/catalogo', require('./routes/catalogo.routes'));
app.use('/api/comisiones', require('./routes/comisiones.routes'));

// Configuración de la conexión a PostgreSQL
const pool = require('./config/db');

// Probar la conexión a la base de datos
pool.connect()
  .then(client => {
    console.log('🟢 Conectado exitosamente a PostgreSQL (CapitalHub)');
    client.release(); // devolvemos la conexión de prueba al pool
  })
  .catch(err => console.error('🔴 Error al conectar con PostgreSQL (Esperando a que termine la instalación...)'));

// Ruta de prueba inicial
app.get('/', (req, res) => {
  res.json({ mensaje: '¡Servidor de CapitalHub funcionando al 100%!' });
});

// Levantar el servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
});