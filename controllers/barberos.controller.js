require('dotenv').config();

const bcrypt = require('bcrypt');
const pool = require('../config/db');

const registrarBarbero = async (req, res) => {
    try {
        const { nombre, telefono, especialidad } = req.body;
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ message: 'El nombre del barbero es obligatorio' });
        }

        const result = await pool.query(
            'INSERT INTO barberos (nombre, telefono, especialidad, activo) VALUES ($1, $2, $3, true) RETURNING *',
            [nombre.trim(), (telefono || '').trim(), (especialidad || '').trim()]
        );
        res.status(201).json({ message: 'Barbero registrado con éxito', barbero: result.rows[0] });
    } catch (error) {
        console.error('Error al registrar barbero:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

const obtenerBarberos = async (req, res) => {
    try {
        const esAdmin = Number(req.user && (req.user.rol_id || req.user.rol)) === 1;
        // El admin además ve con qué cuenta entra cada barbero (los demás usuarios no ven correos)
        const result = esAdmin
            ? await pool.query(
                `SELECT b.*, u.email AS cuenta_email, u.activo AS cuenta_activa
                 FROM barberos b
                 LEFT JOIN usuarios u ON u.id = b.usuario_id
                 ORDER BY b.nombre ASC`)
            : await pool.query('SELECT id, nombre, telefono, especialidad, activo FROM barberos ORDER BY nombre ASC');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error al obtener barberos:', error);
        res.status(500).json({ message: 'Error interno al obtener barberos' });
    }
};

const actualizarBarbero = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, telefono, especialidad, activo } = req.body;

        const campos = [];
        const valores = [];
        let idx = 1;

        if (nombre !== undefined) {
            if (!String(nombre).trim()) {
                return res.status(400).json({ message: 'El nombre no puede estar vacío' });
            }
            campos.push(`nombre = $${idx++}`);
            valores.push(String(nombre).trim());
        }
        if (telefono !== undefined) {
            campos.push(`telefono = $${idx++}`);
            valores.push(String(telefono).trim());
        }
        if (especialidad !== undefined) {
            campos.push(`especialidad = $${idx++}`);
            valores.push(String(especialidad).trim());
        }
        if (activo !== undefined) {
            campos.push(`activo = $${idx++}`);
            valores.push(Boolean(activo));
        }

        if (campos.length === 0) {
            return res.status(400).json({ message: 'No hay cambios para actualizar' });
        }

        valores.push(id);
        const result = await pool.query(
            `UPDATE barberos SET ${campos.join(', ')} WHERE id = $${idx} RETURNING *`,
            valores
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Barbero no encontrado' });
        }

        res.status(200).json({ message: 'Barbero actualizado correctamente', barbero: result.rows[0] });
    } catch (error) {
        console.error('Error al actualizar barbero:', error);
        res.status(500).json({ message: 'Error interno al actualizar barbero' });
    }
};

const eliminarBarbero = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM barberos WHERE id = $1 RETURNING *', [id]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Barbero no encontrado" });
        }
        res.json({ message: "Barbero eliminado correctamente" });
    } catch (error) {
        // 23503 = el registro tiene citas/comisiones ligadas (llave foránea)
        if (error.code === '23503') {
            return res.status(409).json({ message: 'No se puede eliminar: este barbero ya tiene citas registradas. Usa "Desactivar" para que ya no aparezca en la agenda.' });
        }
        console.error("Error al eliminar barbero:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};

// =============================================================================
// Acceso al sistema del barbero (cuenta de usuario con rol 2 enlazada)
// =============================================================================
const ROL_BARBERO = 2;
const COSTO_BCRYPT = 10; // RNF-SEG-02: bcrypt con factor de costo >= 10
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));

// POST /api/barberos/:id/cuenta  { email, password }
const crearCuentaBarbero = async (req, res) => {
    const { id } = req.params;
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!emailValido(email)) {
        return res.status(400).json({ message: 'Escribe un correo válido.' });
    }
    if (password.length < 8) {
        return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const barbRes = await client.query('SELECT * FROM barberos WHERE id = $1 FOR UPDATE', [id]);
        if (barbRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Barbero no encontrado.' });
        }
        const barbero = barbRes.rows[0];
        if (barbero.usuario_id) {
            await client.query('ROLLBACK');
            return res.status(409).json({ message: 'Este barbero ya tiene una cuenta de acceso.' });
        }

        // Separamos "Nombre Apellidos" porque la tabla usuarios los pide por separado
        const partes = String(barbero.nombre).trim().split(/\s+/);
        const nombre = partes.shift();
        const apellidos = partes.join(' ');
        const hash = await bcrypt.hash(password, COSTO_BCRYPT);

        const userRes = await client.query(
            `INSERT INTO usuarios (rol_id, nombre, apellidos, email, telefono, password_hash, activo)
             VALUES ($1, $2, $3, $4, $5, $6, true)
             RETURNING id, email`,
            [ROL_BARBERO, nombre, apellidos, email, barbero.telefono || '', hash]
        );
        await client.query('UPDATE barberos SET usuario_id = $1 WHERE id = $2', [userRes.rows[0].id, id]);
        await client.query('COMMIT');

        res.status(201).json({ message: `Acceso creado. ${barbero.nombre} ya puede iniciar sesión con ${email}.`, email });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.code === '23505') {
            return res.status(409).json({ message: 'Ese correo ya está registrado en el sistema.' });
        }
        if (error.code === '22P02') return res.status(404).json({ message: 'Barbero no encontrado.' });
        console.error('Error al crear cuenta del barbero:', error);
        res.status(500).json({ message: 'Error interno al crear la cuenta.' });
    } finally {
        client.release();
    }
};

// PUT /api/barberos/:id/cuenta  { password }  -> restablece la contraseña
const cambiarContrasenaBarbero = async (req, res) => {
    const { id } = req.params;
    const password = String(req.body.password || '');
    if (password.length < 8) {
        return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres.' });
    }
    try {
        const hash = await bcrypt.hash(password, COSTO_BCRYPT);
        const result = await pool.query(
            `UPDATE usuarios SET password_hash = $1, activo = true, actualizado_en = CURRENT_TIMESTAMP
             WHERE id = (SELECT usuario_id FROM barberos WHERE id = $2)
             RETURNING email`,
            [hash, id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Este barbero no tiene cuenta de acceso.' });
        }
        res.json({ message: 'Contraseña actualizada.' });
    } catch (error) {
        if (error.code === '22P02') return res.status(404).json({ message: 'Barbero no encontrado.' });
        console.error('Error al cambiar contraseña del barbero:', error);
        res.status(500).json({ message: 'Error interno al cambiar la contraseña.' });
    }
};

// DELETE /api/barberos/:id/cuenta -> quita el acceso (la cuenta se desactiva, no se borra)
const quitarCuentaBarbero = async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const barbRes = await client.query('SELECT usuario_id FROM barberos WHERE id = $1 FOR UPDATE', [id]);
        if (barbRes.rows.length === 0 || !barbRes.rows[0].usuario_id) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Este barbero no tiene cuenta de acceso.' });
        }
        await client.query('UPDATE usuarios SET activo = false, actualizado_en = CURRENT_TIMESTAMP WHERE id = $1', [barbRes.rows[0].usuario_id]);
        await client.query('UPDATE barberos SET usuario_id = NULL WHERE id = $1', [id]);
        await client.query('COMMIT');
        res.json({ message: 'Acceso retirado. Ese correo ya no puede iniciar sesión.' });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.code === '22P02') return res.status(404).json({ message: 'Barbero no encontrado.' });
        console.error('Error al quitar cuenta del barbero:', error);
        res.status(500).json({ message: 'Error interno al quitar el acceso.' });
    } finally {
        client.release();
    }
};

module.exports = {
    registrarBarbero, obtenerBarberos, actualizarBarbero, eliminarBarbero,
    crearCuentaBarbero, cambiarContrasenaBarbero, quitarCuentaBarbero
};