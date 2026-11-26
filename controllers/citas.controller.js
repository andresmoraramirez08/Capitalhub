const { generarComisionPorCita } = require('./comisiones.controller');
require('dotenv').config();

const pool = require('../config/db');

// ---------------------------------------------------------------------------
// Helpers de permisos: el admin (rol 1) ve todo; el barbero solo lo suyo.
// El barbero_id viaja dentro del token (se agrega en el login).
// ---------------------------------------------------------------------------
const esAdmin = (req) => Number(req.user && (req.user.rol_id || req.user.rol)) === 1;

// Devuelve el barbero que se debe usar en la consulta, o null si no tiene permiso
const barberoPermitido = (req, barberoSolicitado) => {
    if (esAdmin(req)) return barberoSolicitado;
    return req.user && req.user.barbero_id ? req.user.barbero_id : null;
};

const ORIGENES_VALIDOS = ['WEB', 'PRESENCIAL', 'TELEFONO'];
const MARGEN_LIMPIEZA_MIN = 10; // mismo margen que usa obtenerHorariosDisponibles

// Fecha y hora local del servidor (para no agendar en el pasado)
const fechaYHoraLocal = () => {
    const ahora = new Date();
    const fecha = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    return { fecha, hora: ahora.toTimeString().slice(0, 5) };
};

const aMinutos = (hhmm) => {
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + m;
};

/**
 * Valida que una cita se pueda colocar en ese barbero, fecha y hora.
 * Se usa al agendar y al reprogramar. Debe llamarse dentro de una transacción (client).
 * excluirCitaId: al reprogramar, la propia cita no cuenta como choque.
 * Regresa { ok: true, duracion } o { ok: false, status, message }.
 */
const validarHorarioCita = async (client, { barbero_id, servicio_id, fecha_cita, hora_inicio, excluirCitaId = null }) => {
    const horaInicioStr = String(hora_inicio || '').slice(0, 5);
    if (!/^\d{2}:\d{2}$/.test(horaInicioStr) || !fecha_cita) {
        return { ok: false, status: 400, message: 'Fecha u hora no válida.' };
    }

    const { fecha: hoy, hora: horaActual } = fechaYHoraLocal();
    if (fecha_cita < hoy || (fecha_cita === hoy && horaInicioStr <= horaActual)) {
        return { ok: false, status: 400, message: 'No se puede agendar una cita en una fecha u hora ya pasada.' };
    }

    // 1. Bloqueamos la fila del barbero: si dos personas agendan al mismo tiempo,
    //    la segunda espera a que termine la primera y ya ve su cita (evita empalmes).
    const barberoRes = await client.query('SELECT id, activo FROM barberos WHERE id = $1 FOR UPDATE', [barbero_id]);
    if (barberoRes.rows.length === 0 || barberoRes.rows[0].activo === false) {
        return { ok: false, status: 400, message: 'El barbero no existe o está inactivo.' };
    }

    const servicioRes = await client.query('SELECT duracion_minutos FROM servicios WHERE id = $1', [servicio_id]);
    if (servicioRes.rows.length === 0) {
        return { ok: false, status: 404, message: 'Servicio no encontrado.' };
    }
    const duracion = Number(servicioRes.rows[0].duracion_minutos);

    // 2. La cita debe caber dentro del turno del barbero ese día (y no ser su descanso)
    const turnoRes = await client.query(
        `SELECT hora_inicio, hora_fin, es_descanso
         FROM horarios_barberos
         WHERE barbero_id = $1 AND dia_semana = EXTRACT(DOW FROM $2::date)`,
        [barbero_id, fecha_cita]
    );
    if (turnoRes.rows.length === 0 || turnoRes.rows[0].es_descanso) {
        return { ok: false, status: 400, message: 'El barbero no trabaja ese día.' };
    }
    const turno = turnoRes.rows[0];
    const inicioMin = aMinutos(horaInicioStr);
    if (inicioMin < aMinutos(turno.hora_inicio) || inicioMin + duracion + MARGEN_LIMPIEZA_MIN > aMinutos(turno.hora_fin)) {
        return { ok: false, status: 400, message: 'La hora está fuera del horario del barbero.' };
    }

    // 3. No debe chocar con otra cita activa del mismo barbero, dejando 10 min de limpieza
    //    antes y después de cada cita (misma regla que los horarios disponibles)
    const choqueRes = await client.query(
        `SELECT id FROM citas
         WHERE barbero_id = $1
           AND fecha_cita = $2
           AND estado NOT IN ('CANCELADA', 'NO_ASISTIO')
           AND ($6::uuid IS NULL OR id <> $6::uuid)
           AND hora_inicio < ($3::time + $4 * interval '1 minute')
           AND (hora_fin + $5 * interval '1 minute') > $3::time
         LIMIT 1`,
        [barbero_id, fecha_cita, horaInicioStr, duracion + MARGEN_LIMPIEZA_MIN, MARGEN_LIMPIEZA_MIN, excluirCitaId]
    );
    if (choqueRes.rows.length > 0) {
        return { ok: false, status: 409, message: 'Ese horario ya está ocupado. Elige otra hora.' };
    }

    return { ok: true, duracion, horaInicioStr };
};

const agendarCita = async (req, res) => {
    const client = await pool.connect();
    try {
        const { servicio_id, nombre_invitado, telefono_invitado, email_invitado, fecha_cita, hora_inicio, origen } = req.body;
        const barbero_id = barberoPermitido(req, req.body.barbero_id);

        if (!barbero_id) {
            return res.status(403).json({ message: 'Tu usuario no está enlazado a un barbero.' });
        }
        if (!servicio_id || !fecha_cita || !hora_inicio || !String(nombre_invitado || '').trim() || !String(telefono_invitado || '').trim()) {
            return res.status(400).json({ message: 'Faltan datos obligatorios de la cita.' });
        }

        await client.query('BEGIN');
        const v = await validarHorarioCita(client, { barbero_id, servicio_id, fecha_cita, hora_inicio });
        if (!v.ok) {
            await client.query('ROLLBACK');
            return res.status(v.status).json({ message: v.message });
        }

        const origenFinal = ORIGENES_VALIDOS.includes(String(origen || '').toUpperCase())
            ? String(origen).toUpperCase()
            : 'PRESENCIAL'; // las citas del panel son manuales (teléfono o presencial)

        const result = await client.query(
            `INSERT INTO citas 
            (barbero_id, servicio_id, nombre_invitado, telefono_invitado, email_invitado, fecha_cita, hora_inicio, hora_fin, origen) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $7::time + $8 * interval '1 minute', $9)
            RETURNING *`,
            [
                barbero_id,
                servicio_id,
                String(nombre_invitado).trim(),
                String(telefono_invitado).trim(),
                (email_invitado || '').trim() || null,
                fecha_cita,
                v.horaInicioStr,
                v.duracion,
                origenFinal
            ]
        );

        await client.query('COMMIT');
        res.status(201).json({ message: "Cita agendada con éxito", cita: result.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error("Error al agendar cita:", error);
        res.status(500).json({ message: "Error interno del servidor" });
    } finally {
        client.release();
    }
};

// Cambia fecha, hora (y opcionalmente barbero o servicio) de una cita activa
const reprogramarCita = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { fecha_cita, hora_inicio } = req.body;

        await client.query('BEGIN');
        const actualRes = await client.query('SELECT * FROM citas WHERE id = $1 FOR UPDATE', [id]);
        if (actualRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Cita no encontrada.' });
        }
        const cita = actualRes.rows[0];

        if (!esAdmin(req) && String(cita.barbero_id) !== String(barberoPermitido(req, null))) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'No puedes reprogramar citas de otro barbero.' });
        }
        if (!['PENDIENTE', 'CONFIRMADA'].includes(cita.estado)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Solo se pueden reprogramar citas pendientes o confirmadas.' });
        }

        // El admin puede cambiar de barbero; el barbero no
        const barbero_id = esAdmin(req) && req.body.barbero_id ? req.body.barbero_id : cita.barbero_id;
        const servicio_id = req.body.servicio_id || cita.servicio_id;

        const v = await validarHorarioCita(client, { barbero_id, servicio_id, fecha_cita, hora_inicio, excluirCitaId: id });
        if (!v.ok) {
            await client.query('ROLLBACK');
            return res.status(v.status).json({ message: v.message });
        }

        const result = await client.query(
            `UPDATE citas
             SET barbero_id = $1, servicio_id = $2, fecha_cita = $3, hora_inicio = $4,
                 hora_fin = $4::time + $5 * interval '1 minute', actualizado_en = CURRENT_TIMESTAMP
             WHERE id = $6
             RETURNING *`,
            [barbero_id, servicio_id, fecha_cita, v.horaInicioStr, v.duracion, id]
        );

        await client.query('COMMIT');
        res.json({ message: 'Cita reprogramada correctamente', cita: result.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Error al reprogramar cita:', error);
        res.status(500).json({ message: 'Error interno al reprogramar la cita' });
    } finally {
        client.release();
    }
};

/**
 * Calcula los horarios libres de un barbero en una fecha para un servicio.
 * La usan el panel (obtenerHorariosDisponibles) y el portal del cliente.
 * Regresa { ok: true, horarios: [{hora24, hora12}], mensaje } o { ok: false, status, error }.
 */
const calcularHorariosLibres = async (db, { fecha, barbero_id, servicio_id, excluirCitaId = null }) => {
    const servicioQuery = await db.query(
        'SELECT duracion_minutos FROM servicios WHERE id = $1',
        [servicio_id]
    );

    if (servicioQuery.rows.length === 0) {
        return { ok: false, status: 404, error: 'Servicio no encontrado' };
    }

    const tiempoServicio = servicioQuery.rows[0].duracion_minutos;
    const tiempoTotalRequerido = tiempoServicio + 10; 

    const citasOcupadasQuery = await db.query(
        `SELECT hora_inicio, hora_fin FROM citas 
         WHERE barbero_id = $1 AND fecha_cita = $2 AND estado NOT IN ('CANCELADA', 'NO_ASISTIO')
           AND ($3::uuid IS NULL OR id <> $3::uuid)
         ORDER BY hora_inicio ASC`,
        [barbero_id, fecha, excluirCitaId]
    );
    const citasOcupadas = citasOcupadasQuery.rows;

    const fechaObj = new Date(fecha + 'T12:00:00'); 
    const diaSemana = fechaObj.getDay(); 

    const horarioQuery = await db.query(
        'SELECT hora_inicio, hora_fin, es_descanso FROM horarios_barberos WHERE barbero_id = $1 AND dia_semana = $2',
        [barbero_id, diaSemana]
    );

    if (horarioQuery.rows.length === 0 || horarioQuery.rows[0].es_descanso) {
        return { ok: true, horarios: [], mensaje: "El barbero no trabaja este día o está de descanso" };
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

        // Hay choque si el turno empieza antes de que termine la limpieza de otra cita,
        // o si termina (con su propia limpieza) después de que empiece otra
        const choca = citasEnMinutos.some(cita => {
            return (slotInicio < cita.fin + 10) && (slotFin > cita.inicio);
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

    return { ok: true, horarios, mensaje: "Horarios disponibles calculados" };
};

const obtenerHorariosDisponibles = async (req, res) => {
    try {
        const { fecha, barbero_id, servicio_id } = req.body;
        const excluirCitaId = req.body.excluir_cita_id || null; // al reprogramar, la cita no se bloquea a sí misma

        const r = await calcularHorariosLibres(pool, { fecha, barbero_id, servicio_id, excluirCitaId });
        if (!r.ok) {
            return res.status(r.status).json({ error: r.error });
        }

        res.status(200).json({ 
            mensaje: r.mensaje,
            horariosDisponibles: r.horarios 
        });
    } catch (error) {
        console.error("Error al buscar horarios:", error);
        res.status(500).json({ error: 'Error interno del servidor al calcular horarios' });
    }
};

const obtenerMisCitas = async (req, res) => {
    try {
        const { fecha } = req.body;
        const barbero_id = barberoPermitido(req, req.body.barbero_id);
        if (!barbero_id) {
            return res.status(403).json({ error: 'Tu usuario no está enlazado a un barbero.' });
        }
        const query = `
            SELECT c.servicio_id, to_char(c.fecha_cita, 'YYYY-MM-DD') AS fecha_cita, c.origen,
                   ((c.fecha_cita + c.hora_inicio + COALESCE(c.tolerancia_minutos, 10) * interval '1 minute') <= LOCALTIMESTAMP) AS paso_tolerancia,
                   c.id, c.hora_inicio, c.hora_fin, c.nombre_invitado, c.telefono_invitado, s.nombre AS servicio, c.estado
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
            SELECT c.servicio_id, to_char(c.fecha_cita, 'YYYY-MM-DD') AS fecha_cita, c.origen,
                   ((c.fecha_cita + c.hora_inicio + COALESCE(c.tolerancia_minutos, 10) * interval '1 minute') <= LOCALTIMESTAMP) AS paso_tolerancia,
                   c.id, c.hora_inicio, c.hora_fin, c.nombre_invitado, c.telefono_invitado, s.nombre AS servicio, c.estado, b.nombre AS nombre_barbero
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
        const { fecha } = req.body;
        // El admin puede pedir 'TODOS' o un barbero; el barbero siempre recibe solo su agenda
        const barbero_id = esAdmin(req) ? req.body.barbero_id : barberoPermitido(req, null);
        if (!esAdmin(req) && !barbero_id) {
            return res.status(403).json({ error: 'Tu usuario no está enlazado a un barbero.' });
        }
        let query = `
            SELECT c.servicio_id, to_char(c.fecha_cita, 'YYYY-MM-DD') AS fecha_cita, c.origen,
                   ((c.fecha_cita + c.hora_inicio + COALESCE(c.tolerancia_minutos, 10) * interval '1 minute') <= LOCALTIMESTAMP) AS paso_tolerancia,
                   c.id, c.hora_inicio, c.hora_fin, c.nombre_invitado, c.telefono_invitado,
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
        const ESTADOS_VALIDOS = ['PENDIENTE', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA', 'NO_ASISTIO'];

        if (!ESTADOS_VALIDOS.includes(estado)) {
            return res.status(400).json({ message: "Estado no válido." });
        }

        const actualRes = await pool.query(
            `SELECT estado, barbero_id,
                    (fecha_cita + hora_inicio + COALESCE(tolerancia_minutos, 10) * interval '1 minute') <= LOCALTIMESTAMP AS paso_tolerancia,
                    fecha_cita > CURRENT_DATE AS es_futura
             FROM citas WHERE id = $1`,
            [id]
        );
        if (actualRes.rowCount === 0) {
            return res.status(404).json({ message: "Cita no encontrada" });
        }
        const actual = actualRes.rows[0];

        // El barbero solo puede modificar sus propias citas
        if (!esAdmin(req) && String(actual.barbero_id) !== String(barberoPermitido(req, null))) {
            return res.status(403).json({ message: "No puedes modificar citas de otro barbero." });
        }
        if (actual.estado === 'CANCELADA') {
            return res.status(400).json({ message: "La cita ya está cancelada y no se puede modificar." });
        }
        // Una cita cobrada ya generó su comisión: no se puede cambiar de estado
        if (actual.estado === 'COMPLETADA') {
            return res.status(400).json({ message: "La cita ya fue cobrada y no se puede modificar." });
        }
        if (actual.estado === 'NO_ASISTIO') {
            return res.status(400).json({ message: "La cita ya está marcada como 'No asistió'." });
        }
        // Solo se cobra el día de la cita (o después), no por adelantado
        if (estado === 'COMPLETADA' && actual.es_futura) {
            return res.status(400).json({ message: "No se puede cobrar una cita de un día futuro." });
        }
        // RF-AG-04: solo se marca "No asistió" cuando ya pasaron los minutos de tolerancia
        if (estado === 'NO_ASISTIO' && !actual.paso_tolerancia) {
            return res.status(400).json({ message: "Aún no pasan los 10 minutos de tolerancia de la cita." });
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
    cambiarEstado,
    reprogramarCita,
    // Compartidas con el portal del cliente
    validarHorarioCita,
    calcularHorariosLibres,
    fechaYHoraLocal
};