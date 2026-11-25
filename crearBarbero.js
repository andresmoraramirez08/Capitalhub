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

async function generarBarbero() {
    try {
        // Encriptamos la contraseña 'barbero123'
        const passwordHash = await bcrypt.hash('barbero123', 10);
        
        // Insertamos al usuario con rol_id = 2 (asumiendo que 2 es Barbero)
        await pool.query(`
            INSERT INTO usuarios (rol_id, nombre, apellidos, email, telefono, password_hash)
            VALUES (2, 'Kevin', 'Barbero', 'barbero@barberiacapital.com', '6181112233', $1)
        `, [passwordHash]);
        
        console.log('🟢 Usuario barbero de prueba creado exitosamente.');
    } catch (error) {
        console.error('🔴 Error:', error.message);
    } finally {
        pool.end(); // Cerramos la conexión
    }
}

generarBarbero();