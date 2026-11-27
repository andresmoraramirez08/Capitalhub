const bcrypt = require('bcrypt');
const pool = require('./config/db'); // usa la misma conexión que el servidor (local o DATABASE_URL)

// La contraseña ya no va escrita en el código: se pasa al correr el script.
// Uso: node crearAdmin.js "ContraseñaSegura"
const passwordNueva = process.argv[2] || '';
if (passwordNueva.length < 8) {
    console.error('🔴 Escribe una contraseña de al menos 8 caracteres. Uso: node crearAdmin.js "ContraseñaSegura"');
    process.exit(1);
}

async function generarAdmin() {
    try {
        // Se guarda solo el hash de bcrypt (costo 10, RNF-SEG-02)
        const passwordHash = await bcrypt.hash(passwordNueva, 10);

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