const { Pool } = require('pg');
const { generarComisionPorCita } = require('./comisiones.controller');
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
        const { barbero_id, servicio_id, nombre_invitado, telefono_invitado, fecha_cita, hora_inicio } = req.body;

        const ahora = new Date();
        const fechaHoyLocal = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000)
            .toISOString()
            .split('T')[0];
        const horaActualStr = ahora.toTimeString().slice(0, 5); // "HH:MM"

        if (
            fecha_cita < fechaHoyLocal ||
            (fecha_cita === fechaHoyLocal && String(hora_inicio).slice(0, 5) <= horaActualStr)
        ) {
            return res.status(400).json({ message: 'No se puede agendar una cita en una fecha u hora ya pasada.' });
        }

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

const obtenerHorariosDisponibles = async (req, res) => {
    try {
        const { fecha, barbero_id, servicio_id } = req.body; 

        const servicioQuery = await pool.query(
            'SELECT duracion_minutos FROM servicios WHERE id = $1',
            [servicio_id]
        );
        
        if (servicioQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Servicio no encontrado' });
        }

        const tiempoServicio = servicioQuery.rows[0].duracion_minutos;
        const tiempoTotalRequerido = tiempoServicio + 10; 

        const citasOcupadasQuery = await pool.query(
            `SELECT hora_inicio, hora_fin FROM citas 
             WHERE barbero_id = $1 AND fecha_cita = $2 AND estado != 'CANCELADA'
             ORDER BY hora_inicio ASC`,
            [barbero_id, fecha]
        );
        const citasOcupadas = citasOcupadasQuery.rows;

        const fechaObj = new Date(fecha + 'T12:00:00'); 
        const diaSemana = fechaObj.getDay(); 

        const horarioQuery = await pool.query(
            'SELECT hora_inicio, hora_fin, es_descanso FROM horarios_barberos WHERE barbero_id = $1 AND dia_semana = $2',
            [barbero_id, diaSemana]
        );

        if (horarioQuery.rows.length === 0 || horarioQuery.rows[0].es_descanso) {
            return res.status(200).json({ 
                mensaje: "El barbero no trabaja este día o está de descanso",
                horariosDisponibles: [] 
            });
        }

        const turnoBarbero = horarioQuery.rows[0];
        const [horaEntrada, minEntrada] = turnoBarbero.hora_inicio.split(':').map(Number);
        const [horaSalida, minSalida] = turnoBarbero.hora_fin.split(':').map(Number);

        const aperturaMinutos = (horaEntrada * 60) + minEntrada;
        const cierreMinutos = (horaSalida * 60) + minSalida;
        const intervalo = 30; 

        const citasEnMinutos = citasOcupadas.map(cita => {
            const [horaI, minI] = cita.hora_inicio.split(':').map(Number);
            const [horaF, minF] = cita.hora_fin.split(':').map(Number);
            return {
                inicio: (horaI * 60) + minI,
                fin: (horaF * 60) + minF
            };
        });

        const horarios = [];

        for (let tiempo = aperturaMinutos; (tiempo + tiempoTotalRequerido) <= cierreMinutos; tiempo += intervalo) {
            const slotInicio = tiempo;
            const slotFin = tiempo + tiempoTotalRequerido;

            const choca = citasEnMinutos.some(cita => {
                return (slotInicio < cita.fin) && (slotFin > cita.inicio);
            });

            if (!choca) {
                const horas = Math.floor(slotInicio / 60).toString().padStart(2, '0');
                const minutos = (slotInicio % 60).toString().padStart(2, '0');
                
                const ampm = Math.floor(slotInicio / 60) >= 12 ? 'PM' : 'AM';
                const horas12 = Math.floor(slotInicio / 60) % 12 || 12;

                horarios.push({
                    hora24: `${horas}:${minutos}`,
                    hora12: `${horas12}:${minutos} ${ampm}`
                });
            }
        }

        res.status(200).json({ 
            mensaje: "Horarios disponibles calculados",
            horariosDisponibles: horarios 
        });
    } catch (error) {
        console.error("Error al buscar horarios:", error);
        res.status(500).json({ error: 'Error interno del servidor al calcular horarios' });
    }
};

const obtenerMisCitas = async (req, res) => {
    try {
        const { barbero_id, fecha } = req.body;
        const query = `
            SELECT c.id, c.hora_inicio, c.hora_fin, c.nombre_invitado, c.telefono_invitado, s.nombre AS servicio, c.estado
            FROM citas c
            JOIN servicios s ON c.servicio_id = s.id
            WHERE c.barbero_id = $1 AND c.fecha_cita = $2
            ORDER BY c.hora_inicio ASC;
        `;
        const resultado = await pool.query(query, [barbero_id, fecha]);
        res.status(200).json(resultado.rows);
    } catch (error) {
        console.error("Error al obtener las citas del barbero:", error);
        res.status(500).json({ error: 'Error al obtener las citas' });
    }
}; 

const obtenerTodasLasCitasHoy = async (req, res) => {
    try {
        const { fecha } = req.body;
        const query = `
            SELECT c.id, c.hora_inicio, c.hora_fin, c.nombre_invitado, c.telefono_invitado, s.nombre AS servicio, c.estado, b.nombre AS nombre_barbero
            FROM citas c
            JOIN servicios s ON c.servicio_id = s.id
            JOIN barberos b ON c.barbero_id = b.id
            WHERE c.fecha_cita = $1
            ORDER BY c.hora_inicio ASC;
        `;
        const resultado = await pool.query(query, [fecha]);
        res.status(200).json(resultado.rows);
    } catch (error) {
        console.error("Error al obtener todas las citas:", error);
        res.status(500).json({ error: 'Error al obtener todas las citas' });
    }
};

// Consulta citas por fecha y opcionalmente por barbero_id
const obtenerCitasPorFecha = async (req, res) => {
    try {
        const { fecha, barbero_id } = req.body;
        let query = `
            SELECT c.id, c.hora_inicio, c.hora_fin, c.nombre_invitado, c.telefono_invitado,
                   s.nombre AS servicio, s.precio, c.estado, b.id AS barbero_id, b.nombre AS nombre_barbero
            FROM citas c
            JOIN servicios s ON c.servicio_id = s.id
            JOIN barberos b ON c.barbero_id = b.id
            WHERE c.fecha_cita = $1
        `;
        const params = [fecha];

        if (barbero_id && barbero_id !== 'TODOS') {
            query += ` AND c.barbero_id = $2`;
            params.push(barbero_id);
        }

        query += ` ORDER BY c.hora_inicio ASC;`;

        const resultado = await pool.query(query, params);
        res.status(200).json(resultado.rows);
    } catch (error) {
        console.error("Error al obtener citas por fecha:", error);
        res.status(500).json({ error: 'Error al obtener citas por fecha' });
    }
};

const cambiarEstado = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;

        const actualRes = await pool.query('SELECT estado FROM citas WHERE id = $1', [id]);
        if (actualRes.rowCount === 0) {
            return res.status(404).json({ message: "Cita no encontrada" });
        }
        if (actualRes.rows[0].estado === 'CANCELADA') {
            return res.status(400).json({ message: "La cita ya está cancelada y no se puede modificar." });
        }

        const result = await pool.query(
            'UPDATE citas SET estado = $1, actualizado_en = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [estado, id]
        );

        if (estado === 'COMPLETADA') {
            try {
                await generarComisionPorCita(pool, id);
            } catch (comError) {
                console.error("Error al generar comisión automática de la cita:", comError);
            }
        }

        res.json({ message: "Estado actualizado", cita: result.rows[0] });
    } catch (error) {
        console.error("Error al cambiar estado:", error);
        res.status(500).json({ message: "Error al actualizar estado" });
    }
};

module.exports = {
    agendarCita,
    obtenerHorariosDisponibles,
    obtenerMisCitas,
    obtenerTodasLasCitasHoy,
    obtenerCitasPorFecha,
    cambiarEstado
};