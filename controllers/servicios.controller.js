const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const registrarServicio = async (req, res) => {
    try {
        const { nombre, precio, duracion_minutos } = req.body;
        const result = await pool.query(
            'INSERT INTO servicios (nombre, precio, duracion_minutos) VALUES ($1, $2, $3) RETURNING *',
            [nombre, precio, duracion_minutos]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error interno al guardar servicio' });
    }
};

const obtenerServicios = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM servicios ORDER BY nombre ASC');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error al obtener servicios:', error);
        res.status(500).json({ message: 'Error interno al obtener servicios' });
    }
};

const actualizarServicio = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, precio, duracion_minutos } = req.body;

        if (!nombre || !nombre.trim() || precio === undefined || Number(precio) < 0 || !duracion_minutos || Number(duracion_minutos) <= 0) {
            return res.status(400).json({ message: 'Nombre, precio válido y duración mayor a 0 son obligatorios' });
        }

        const result = await pool.query(
            `UPDATE servicios
             SET nombre = $1, precio = $2, duracion_minutos = $3
             WHERE id = $4
             RETURNING *`,
            [nombre.trim(), Number(precio), Number(duracion_minutos), id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Servicio no encontrado' });
        }

        res.status(200).json({ message: 'Servicio actualizado correctamente', servicio: result.rows[0] });
    } catch (error) {
        console.error('Error al actualizar servicio:', error);
        res.status(500).json({ message: 'Error interno al actualizar servicio' });
    }
};

const eliminarServicio = async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            'DELETE FROM servicios WHERE id = $1 RETURNING *', 
            [id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Servicio no encontrado" });
        }

        res.json({ message: "Servicio eliminado correctamente" });
    } catch (error) {
        console.error("Error al eliminar servicio:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};

module.exports = { registrarServicio, obtenerServicios, actualizarServicio, eliminarServicio };