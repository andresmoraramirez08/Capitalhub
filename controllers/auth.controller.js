const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const pool = require('../config/db');
const {
    AVISO_PRIVACIDAD_VERSION, limpiarTelefono, limpiarTexto, emailValido
} = require('../config/portal');

const ROL_CLIENTE = 3;
const COSTO_BCRYPT = 10; // RNF-SEG-02

/** Un hash de bcrypt empieza con $2a$, $2b$ o $2y$. Los clientes creados en mostrador no tienen uno. */
const tieneContrasenaReal = (hash) => /^\$2[aby]\$/.test(String(hash || ''));

/** Arma el token y la respuesta de sesión (la usan login y registro) */
const generarSesion = (usuario, barberoId = null) => {
    const token = jwt.sign(
        { id: usuario.id, rol_id: usuario.rol_id, barbero_id: barberoId },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
    );
    return {
        message: 'Login exitoso',
        token: token,
        nombre: usuario.nombre,
        id: usuario.id,
        rol: usuario.rol_id,
        barbero_id: barberoId
    };
};

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
        res.json(generarSesion(usuario, barberoId));
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
};

/**
 * RF-AUT-01: registro de clientes desde el portal. Siempre rol 3.
 * Si el cliente ya existía porque lo dieron de alta en mostrador (sin contraseña),
 * se activa esa misma cuenta cuando coinciden correo y teléfono, para no duplicarlo.
 */
const registro = async (req, res) => {
    const nombre = limpiarTexto(req.body.nombre, 100);
    const apellidos = limpiarTexto(req.body.apellidos, 100);
    const telefono = limpiarTelefono(req.body.telefono);
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (nombre.length < 2 || apellidos.length < 2) {
        return res.status(400).json({ message: 'Escribe tu nombre y tus apellidos.' });
    }
    if (!telefono) {
        return res.status(400).json({ message: 'El teléfono debe tener 10 dígitos.' });
    }
    if (!emailValido(email)) {
        return res.status(400).json({ message: 'El correo electrónico no es válido.' });
    }
    if (password.length < 8 || password.length > 72) {
        return res.status(400).json({ message: 'La contraseña debe tener entre 8 y 72 caracteres.' });
    }
    if (req.body.acepta_aviso !== true) {
        return res.status(400).json({ message: 'Debes aceptar el aviso de privacidad para crear tu cuenta.' });
    }

    const client = await pool.connect();
    try {
        const hash = await bcrypt.hash(password, COSTO_BCRYPT);
        await client.query('BEGIN');

        // ¿Ya hay alguien con ese correo? (cualquier rol)
        const porCorreo = await client.query(
            'SELECT id, rol_id, telefono, password_hash FROM usuarios WHERE LOWER(email) = $1 FOR UPDATE',
            [email]
        );
        let usuarioId = null;

        if (porCorreo.rows.length > 0) {
            const existente = porCorreo.rows[0];
            const esClienteSinCuenta = Number(existente.rol_id) === ROL_CLIENTE && !tieneContrasenaReal(existente.password_hash);
            if (!esClienteSinCuenta) {
                await client.query('ROLLBACK');
                return res.status(409).json({ message: 'Ya existe una cuenta con ese correo. Inicia sesión.' });
            }
            if (limpiarTelefono(existente.telefono) !== telefono) {
                await client.query('ROLLBACK');
                return res.status(409).json({ message: 'Ese correo ya está registrado en la barbería con otro teléfono. Usa el mismo teléfono que diste en el local o pide ayuda en la barbería.' });
            }
            usuarioId = existente.id;
        } else {
            // Cliente de mostrador registrado solo con teléfono (correo interno generado por el panel)
            const porTelefono = await client.query(
                `SELECT id, password_hash FROM usuarios
                 WHERE rol_id = $1 AND telefono = $2 AND email LIKE '%@clientes.capitalhub.local'
                 LIMIT 1 FOR UPDATE`,
                [ROL_CLIENTE, telefono]
            );
            if (porTelefono.rows.length > 0 && !tieneContrasenaReal(porTelefono.rows[0].password_hash)) {
                usuarioId = porTelefono.rows[0].id;
            }
        }

        let usuario;
        if (usuarioId) {
            // Activamos la cuenta que ya existía (conserva su historial en el panel)
            const upd = await client.query(
                `UPDATE usuarios
                 SET nombre = $1, apellidos = $2, telefono = $3, email = $4, password_hash = $5, activo = true,
                     aviso_privacidad_aceptado_en = CURRENT_TIMESTAMP, aviso_privacidad_version = $6,
                     actualizado_en = CURRENT_TIMESTAMP
                 WHERE id = $7
                 RETURNING id, rol_id, nombre`,
                [nombre, apellidos, telefono, email, hash, AVISO_PRIVACIDAD_VERSION, usuarioId]
            );
            usuario = upd.rows[0];
        } else {
            const ins = await client.query(
                `INSERT INTO usuarios (rol_id, nombre, apellidos, email, telefono, password_hash, activo,
                                       aviso_privacidad_aceptado_en, aviso_privacidad_version)
                 VALUES ($1, $2, $3, $4, $5, $6, true, CURRENT_TIMESTAMP, $7)
                 RETURNING id, rol_id, nombre`,
                [ROL_CLIENTE, nombre, apellidos, email, telefono, hash, AVISO_PRIVACIDAD_VERSION]
            );
            usuario = ins.rows[0];
        }

        await client.query('COMMIT');
        // Queda con la sesión iniciada para que pueda agendar de inmediato
        res.status(201).json({ ...generarSesion(usuario), message: 'Cuenta creada con éxito' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') { // correo duplicado (dos registros al mismo tiempo)
            return res.status(409).json({ message: 'Ya existe una cuenta con ese correo. Inicia sesión.' });
        }
        console.error('Error en el registro de cliente:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    } finally {
        client.release();
    }
};

module.exports = { login, registro };