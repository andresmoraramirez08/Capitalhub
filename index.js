// La hora del servidor es la de México (los hostings usan UTC). Debe ir antes de todo.
process.env.TZ = process.env.TZ || 'America/Mexico_City';

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
const enProduccion = process.env.NODE_ENV === 'production';

if (!process.env.JWT_SECRET) {
    console.error('🔴 Falta la variable JWT_SECRET. Agrégala al .env (o al panel del hosting) y reinicia.');
    process.exit(1);
}

// En el hosting hay un proxy delante (HTTPS): así req.ip es la IP real del cliente
// y el límite de intentos funciona por persona y no por proxy.
if (enProduccion) app.set('trust proxy', 1);
app.disable('x-powered-by');

// 1. PRIMERO LOS MIDDLEWARES (Lectores de datos)
// El frontend se sirve desde este mismo servidor. En producción solo se acepta el propio dominio.
app.use(cors(process.env.URL_PUBLICA ? { origin: process.env.URL_PUBLICA.replace(/\/+$/, '') } : {}));
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
app.use('/api/portal', require('./routes/portal.routes')); // portal del cliente (página pública)
app.use('/api/tienda', require('./routes/tienda.routes'));  // tienda en línea con Mercado Pago
require('./controllers/tienda.controller').iniciarTareasTienda(); // cancela pagos en línea vencidos

// Configuración de la conexión a PostgreSQL
const pool = require('./config/db');

// Probar la conexión a la base de datos
pool.connect()
  .then(async client => {
    console.log('🟢 Conectado exitosamente a PostgreSQL (CapitalHub)');
    try {
      // ¿La base trabaja con la hora de México? (necesario para las reglas de 24 h y 5 h)
      const r = await client.query("SELECT (now() AT TIME ZONE 'America/Mexico_City') = LOCALTIMESTAMP AS ok, current_database() AS base");
      if (!r.rows[0].ok) {
        console.warn(`⚠️  La base no está en hora de México. Corre una vez: ALTER DATABASE ${r.rows[0].base} SET timezone = 'America/Mexico_City'; y reinicia.`);
      }
    } finally {
      client.release(); // devolvemos la conexión de prueba al pool
    }
  })
  .catch(err => console.error('🔴 Error al conectar con PostgreSQL (Esperando a que termine la instalación...)'));

// Ruta de prueba (la raíz "/" ahora muestra la página pública frontend/index.html)
app.get('/api/salud', (req, res) => {
  res.json({ mensaje: '¡Servidor de CapitalHub funcionando al 100%!' });
});

// Levantar el servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
});