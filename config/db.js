// =============================================================================
// CapitalHub - Conexión única a PostgreSQL
// Todos los controladores comparten este mismo pool de conexiones.
//   - En el hosting: una sola variable DATABASE_URL (la da Neon, Render o Railway).
//   - En la computadora: las variables DB_USER, DB_HOST, DB_NAME, DB_PASSWORD y DB_PORT.
// =============================================================================
const { Pool } = require('pg');
require('dotenv').config();

const pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL }) // el SSL va indicado en la URL (sslmode=require)
    : new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
    });

// Zona horaria: las reglas de 24 h, 5 h y tolerancia usan la hora de la base (LOCALTIMESTAMP).
// En la nube la base viene en UTC; se corrige una sola vez con:
//   ALTER DATABASE <nombre_de_la_base> SET timezone = 'America/Mexico_City';
// index.js revisa al arrancar que la hora de la base sea la de México.

// Si una conexión inactiva falla, lo registramos sin tumbar el servidor
pool.on('error', (err) => {
    console.error('🔴 Error inesperado en la conexión a PostgreSQL:', err.message);
});

module.exports = pool;
