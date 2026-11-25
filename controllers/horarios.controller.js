const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const configurarHorario = async (req, res) => {
    try {
        const { barbero_id, horarios } = req.body;
        
        // 1. Borramos los horarios viejos de este barbero para evitar duplicados
        await pool.query('DELETE FROM horarios_barberos WHERE barbero_id = $1', [barbero_id]);

        // 2. Insertamos la nueva semana día por día
        for (let turno of horarios) {
            await pool.query(
                `INSERT INTO horarios_barberos (barbero_id, dia_semana, hora_inicio, hora_fin, es_descanso)
                 VALUES ($1, $2, $3, $4, $5)`,
                [barbero_id, turno.dia_semana, turno.hora_inicio, turno.hora_fin, turno.es_descanso]
            );
        }
        res.json({ message: "Horarios actualizados correctamente" });
    } catch (error) {
        console.error("Error al guardar horarios:", error);
        res.status(500).json({ message: "Error interno al guardar horarios" });
    }
};

const obtenerHorario = async (req, res) => {
    try {
        const { barbero_id } = req.params;
        const result = await pool.query(
            'SELECT * FROM horarios_barberos WHERE barbero_id = $1 ORDER BY dia_semana ASC', 
            [barbero_id]
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Error al obtener horarios:", error);
        res.status(500).json({ message: "Error al obtener horarios" });
    }
};

module.exports = { configurarHorario, obtenerHorario };