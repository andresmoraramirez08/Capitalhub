const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        // 1. Buscar al usuario
        const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        const usuario = result.rows[0];

        // 2. Verificar contraseña cifrada
        const passwordValida = await bcrypt.compare(password, usuario.password_hash);
        if (!passwordValida) {
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }

        // 3. Generar Token JWT
        const token = jwt.sign(
            { id: usuario.id, rol_id: usuario.rol_id },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({ message: 'Login exitoso', token, nombre: usuario.nombre });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error del servidor' });
    }
};

module.exports = { login };