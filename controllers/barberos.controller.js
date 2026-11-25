const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

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
        const result = await pool.query('SELECT * FROM barberos ORDER BY nombre ASC');
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
        console.error("Error al eliminar barbero:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};

module.exports = { registrarBarbero, obtenerBarberos, actualizarBarbero, eliminarBarbero };