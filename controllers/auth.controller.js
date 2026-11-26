const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const pool = require('../config/db');

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

        if (usuario.activo === false) {
            return res.status(403).json({ message: 'Tu cuenta está desactivada' });
        }

        // 3. Si es barbero (rol 2), buscamos su registro en la tabla barberos
        let barberoId = null;
        if (Number(usuario.rol_id) === 2) {
            try {
                const barb = await pool.query('SELECT id FROM barberos WHERE usuario_id = $1', [usuario.id]);
                if (barb.rows.length > 0) barberoId = barb.rows[0].id;
            } catch (e) {
                console.error('No se pudo enlazar el barbero (¿falta la columna barberos.usuario_id?):', e.message);
            }
        }

        // 4. Generar Token JWT
        const token = jwt.sign(
            { id: usuario.id, rol_id: usuario.rol_id, barbero_id: barberoId },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            message: 'Login exitoso',
            token: token,
            nombre: usuario.nombre,
            id: usuario.id,
            rol: usuario.rol_id,
            barbero_id: barberoId
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
};

module.exports = { login };