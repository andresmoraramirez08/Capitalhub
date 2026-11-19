const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const agendarCita = async (req, res) => {
    try {
        // 1. Ya NO pedimos hora_fin al frontend
        const { barbero_id, servicio_id, nombre_invitado, telefono_invitado, fecha_cita, hora_inicio } = req.body;
        
        // 2. Magia SQL: Calculamos la hora de fin sumando la duración del servicio en minutos
        const result = await pool.query(
            `INSERT INTO citas 
            (barbero_id, servicio_id, nombre_invitado, telefono_invitado, fecha_cita, hora_inicio, hora_fin) 
            VALUES (
                $1, $2, $3, $4, $5, $6, 
                $6::time + (SELECT duracion_minutos FROM servicios WHERE id = $2) * interval '1 minute'
            ) RETURNING *`,
            [barbero_id, servicio_id, nombre_invitado, telefono_invitado, fecha_cita, hora_inicio]
        );
        
        res.status(201).json({ message: "Cita agendada con éxito", cita: result.rows[0] });
    } catch (error) {
        console.error("Error al agendar cita:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    }
};
module.exports = {
    agendarCita
};