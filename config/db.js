// =============================================================================
// CapitalHub - Conexión única a PostgreSQL
// Todos los controladores comparten este mismo pool de conexiones.
// =============================================================================
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Si una conexión inactiva falla, lo registramos sin tumbar el servidor
pool.on('error', (err) => {
    console.error('🔴 Error inesperado en la conexión a PostgreSQL:', err.message);
});

module.exports = pool;
