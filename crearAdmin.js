const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function generarAdmin() {
    try {
        // Encriptamos la contraseña 'admin123' con costo 10
        const passwordHash = await bcrypt.hash('admin123', 10);

        await pool.query(`
            INSERT INTO usuarios (rol_id, nombre, apellidos, email, telefono, password_hash)
            VALUES (1, 'Admin', 'Principal', 'admin@barberiacapital.com', '6180000000', $1)
        `, [passwordHash]);

        console.log('🟢 Usuario administrador creado exitosamente.');
    } catch (error) {
        console.error('🔴 Error:', error.message);
    } finally {
        pool.end();
    }
}

generarAdmin();