const bcrypt = require('bcrypt');
const pool = require('./config/db'); // usa la misma conexión que el servidor (local o DATABASE_URL)

// La contraseña ya no va escrita en el código: se pasa al correr el script.
// Uso: node crearBarbero.js "ContraseñaSegura"
const passwordNueva = process.argv[2] || '';
if (passwordNueva.length < 8) {
    console.error('🔴 Escribe una contraseña de al menos 8 caracteres. Uso: node crearBarbero.js "ContraseñaSegura"');
    process.exit(1);
}

async function generarBarbero() {
    try {
        // Se guarda solo el hash de bcrypt (costo 10, RNF-SEG-02)
        const passwordHash = await bcrypt.hash(passwordNueva, 10);
        
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