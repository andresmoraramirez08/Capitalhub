const { Pool } = require('pg');

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
        const result = await pool.query(
            'INSERT INTO barberos (nombre, telefono, especialidad, activo) VALUES ($1, $2, $3, true) RETURNING *',
            [nombre, telefono, especialidad]
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

module.exports = { registrarBarbero };
module.exports = { registrarBarbero, obtenerBarberos };