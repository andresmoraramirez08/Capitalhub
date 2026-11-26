require('dotenv').config();

const pool = require('../config/db');

const HORA_APERTURA = '11:00';
const HORA_CIERRE = '21:00';

const configurarHorario = async (req, res) => {
    const { barbero_id, horarios } = req.body;

    // 1. Validamos todo ANTES de tocar la base de datos
    if (!barbero_id || !Array.isArray(horarios) || horarios.length === 0) {
        return res.status(400).json({ message: 'Faltan el barbero o los horarios.' });
    }
    const dias = new Set();
    for (const turno of horarios) {
        const dia = Number(turno.dia_semana);
        if (!Number.isInteger(dia) || dia < 0 || dia > 6 || dias.has(dia)) {
            return res.status(400).json({ message: 'Día de la semana inválido o repetido.' });
        }
        dias.add(dia);
        if (!turno.es_descanso) {
            const inicio = String(turno.hora_inicio || '').slice(0, 5);
            const fin = String(turno.hora_fin || '').slice(0, 5);
            if (!inicio || !fin || fin <= inicio) {
                return res.status(400).json({ message: 'La hora de salida debe ser después de la hora de entrada.' });
            }
            // El horario de la barbería es fijo: de 11:00 a 21:00
            if (inicio < HORA_APERTURA || fin > HORA_CIERRE) {
                return res.status(400).json({ message: `Los turnos deben estar entre ${HORA_APERTURA} y ${HORA_CIERRE}.` });
            }
        }
    }

    // 2. Guardamos en una transacción: si algo falla, se conservan los horarios anteriores
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM horarios_barberos WHERE barbero_id = $1', [barbero_id]);
        for (const turno of horarios) {
            await client.query(
                `INSERT INTO horarios_barberos (barbero_id, dia_semana, hora_inicio, hora_fin, es_descanso)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    barbero_id,
                    Number(turno.dia_semana),
                    turno.es_descanso ? HORA_APERTURA : turno.hora_inicio,
                    turno.es_descanso ? HORA_CIERRE : turno.hora_fin,
                    Boolean(turno.es_descanso)
                ]
            );
        }
        await client.query('COMMIT');
        res.json({ message: "Horarios actualizados correctamente" });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error("Error al guardar horarios:", error);
        res.status(500).json({ message: "Error interno al guardar horarios (no se modificó nada)" });
    } finally {
        client.release();
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