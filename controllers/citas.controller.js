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
    // Función para calcular y enviar los horarios disponibles
const obtenerHorariosDisponibles = async (req, res) => {
    try {
        const { fecha, barbero_id, servicio_id } = req.body; 

        // 1. Obtener la duración del servicio de la base de datos
        const servicioQuery = await pool.query(
            'SELECT duracion_minutos FROM servicios WHERE id = $1', // Asegúrate de que la columna se llame 'tiempo' o 'duracion' según tu BD
            [servicio_id]
        );
        
        if (servicioQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Servicio no encontrado' });
        }

        // 2. Sumarle los 10 minutos de limpieza para tener el bloque total real
        const tiempoServicio = servicioQuery.rows[0].duracion_minutos;
        const tiempoTotalRequerido = tiempoServicio + 10; 

        // 3. Obtener las citas que ya están apartadas para ese barbero en ese día
        const citasOcupadasQuery = await pool.query(
            'SELECT hora_inicio, hora_fin FROM citas WHERE barbero_id = $1 AND fecha_cita = $2 ORDER BY hora_inicio ASC',
            [barbero_id, fecha]
        );
        const citasOcupadas = citasOcupadasQuery.rows;

        // Por ahora enviamos estos datos de prueba para verificar que la base responde bien
        res.json({
            mensaje: "Datos obtenidos correctamente",
            tiempoTotalConLimpieza: tiempoTotalRequerido,
            citasOcupadas: citasOcupadas
        });

    } catch (error) {
        console.error("Error al buscar horarios:", error);
        res.status(500).json({ error: 'Error interno del servidor al calcular horarios' });
    }
};

module.exports = {
    agendarCita,
    obtenerHorariosDisponibles
};