// =============================================================================
// CapitalHub - Portal del cliente (página pública, registro y "Mis citas")
// Reglas del SRS:
//   RF-AUT-02 invitado (nombre, teléfono y correo)   RF-AG-02 reservar con 24 h o más
//   RF-AG-03 cancelar o reprogramar con 5 h o más    RF-AUT-03 cada rol ve solo lo suyo
// Las validaciones de horario se reutilizan del módulo de citas del panel.
// =============================================================================
const pool = require('../config/db');
const { validarHorarioCita, calcularHorariosLibres } = require('./citas.controller');
const { buscarOCrearCliente, ROL_CLIENTE } = require('./clientes.controller');
const { enviarCorreo, correoCita } = require('../config/correo');
const {
    AVISO_PRIVACIDAD_VERSION, HORAS_MIN_RESERVA, HORAS_MIN_CANCELACION,
    REGEX_FECHA, REGEX_HORA, REGEX_UUID,
    limpiarTelefono, limpiarTexto, emailValido, fechaHoraDentroDe, cumpleAnticipacion
} = require('../config/portal');

const TELEFONO_BARBERIA = '618-310-0009';
const ESTADOS_ACTIVOS = ['PENDIENTE', 'CONFIRMADA'];

/** RF-AG-06: avisa por correo (sin esperar la respuesta, para no hacer lenta la página) */
const avisarCita = (tipo, citaId) => {
    pool.query(
        `SELECT c.email_invitado, c.nombre_invitado, to_char(c.fecha_cita, 'YYYY-MM-DD') AS fecha_cita,
                to_char(c.hora_inicio, 'HH24:MI') AS hora_inicio, s.nombre AS servicio, s.precio, b.nombre AS barbero
         FROM citas c JOIN servicios s ON s.id = c.servicio_id JOIN barberos b ON b.id = c.barbero_id
         WHERE c.id = $1`, [citaId]
    ).then(r => {
        const c = r.rows[0];
        if (!c || !c.email_invitado) return;
        const { asunto, html } = correoCita(tipo, c, String(c.nombre_invitado || '').split(' ')[0]);
        return enviarCorreo({ para: c.email_invitado, nombre: c.nombre_invitado, asunto, html });
    }).catch(e => console.error('Portal - correo de cita:', e.message));
};

const esCliente = (req) => req.user && Number(req.user.rol_id || req.user.rol) === ROL_CLIENTE;
const idServicioValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;

// Datos públicos de una cita para mostrar al cliente (nunca los de otras personas)
const SELECT_CITA_CLIENTE = `
    SELECT c.id, to_char(c.fecha_cita, 'YYYY-MM-DD') AS fecha_cita,
           to_char(c.hora_inicio, 'HH24:MI') AS hora_inicio, to_char(c.hora_fin, 'HH24:MI') AS hora_fin,
           c.estado, c.servicio_id, s.nombre AS servicio, s.precio, s.duracion_minutos,
           c.barbero_id, b.nombre AS barbero,
           (c.estado IN ('PENDIENTE', 'CONFIRMADA')
               AND (c.fecha_cita + c.hora_inicio) >= LOCALTIMESTAMP + ${HORAS_MIN_CANCELACION} * interval '1 hour') AS puede_modificar,
           ((c.fecha_cita + c.hora_inicio) >= LOCALTIMESTAMP) AS es_proxima
    FROM citas c
    JOIN servicios s ON s.id = c.servicio_id
    JOIN barberos b ON b.id = c.barbero_id`;

// -----------------------------------------------------------------------------
// Catálogos públicos (sin token)
// -----------------------------------------------------------------------------
const obtenerServicios = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, nombre, descripcion, duracion_minutos, precio FROM servicios ORDER BY id ASC'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Portal - error al obtener servicios:', error);
        res.status(500).json({ message: 'No se pudieron cargar los servicios.' });
    }
};

// Solo barberos activos que tienen al menos un día de trabajo configurado. Sin teléfono ni cuenta.
const obtenerBarberos = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT b.id, b.nombre, b.especialidad,
                    array_agg(h.dia_semana ORDER BY h.dia_semana) AS dias_laborales
             FROM barberos b
             JOIN horarios_barberos h ON h.barbero_id = b.id AND h.es_descanso = false
             WHERE b.activo = true
             GROUP BY b.id, b.nombre, b.especialidad
             ORDER BY b.nombre ASC`
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Portal - error al obtener barberos:', error);
        res.status(500).json({ message: 'No se pudo cargar el equipo.' });
    }
};

// Productos para consulta (la compra en línea queda para después). Sin cantidades exactas de stock.
const obtenerProductos = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.id, p.nombre, p.descripcion, p.precio, c.nombre AS categoria,
                    (p.stock_actual > 0) AS disponible
             FROM productos p
             LEFT JOIN categorias_productos c ON c.id = p.categoria_id
             WHERE p.activo = true
             ORDER BY c.nombre NULLS LAST, p.nombre`
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Portal - error al obtener productos:', error);
        res.status(500).json({ message: 'No se pudieron cargar los productos.' });
    }
};

// -----------------------------------------------------------------------------
// Horarios disponibles (público). Igual que el panel, pero sin horas a menos de 24 h.
// -----------------------------------------------------------------------------
const horariosDisponibles = async (req, res) => {
    try {
        const { fecha, barbero_id, servicio_id } = req.body;
        if (!REGEX_FECHA.test(String(fecha || '')) || !REGEX_UUID.test(String(barbero_id || '')) || !idServicioValido(servicio_id)) {
            return res.status(400).json({ message: 'Datos de búsqueda no válidos.' });
        }

        const barbero = await pool.query('SELECT activo FROM barberos WHERE id = $1', [barbero_id]);
        if (barbero.rows.length === 0 || barbero.rows[0].activo === false) {
            return res.status(404).json({ message: 'El barbero no está disponible.' });
        }

        const limite = fechaHoraDentroDe(HORAS_MIN_RESERVA);
        if (fecha < limite.fecha) {
            return res.json({ mensaje: 'Las citas en línea se reservan con al menos 24 horas de anticipación.', horariosDisponibles: [] });
        }

        // Al reprogramar, la propia cita del cliente no bloquea su horario
        let excluirCitaId = null;
        if (esCliente(req) && REGEX_UUID.test(String(req.body.excluir_cita_id || ''))) {
            const propia = await pool.query('SELECT id FROM citas WHERE id = $1 AND usuario_id = $2', [req.body.excluir_cita_id, req.user.id]);
            if (propia.rows.length > 0) excluirCitaId = propia.rows[0].id;
        }

        const r = await calcularHorariosLibres(pool, { fecha, barbero_id, servicio_id: Number(servicio_id), excluirCitaId });
        if (!r.ok) {
            return res.status(r.status).json({ message: r.error });
        }
        const horarios = r.horarios.filter(h => cumpleAnticipacion(fecha, h.hora24));
        res.json({
            mensaje: horarios.length ? r.mensaje : (r.horarios.length ? 'No quedan horarios con 24 horas de anticipación ese día.' : r.mensaje),
            horariosDisponibles: horarios
        });
    } catch (error) {
        console.error('Portal - error al calcular horarios:', error);
        res.status(500).json({ message: 'No se pudieron calcular los horarios.' });
    }
};

// -----------------------------------------------------------------------------
// Agendar desde la web: como invitado o con cuenta de cliente
// -----------------------------------------------------------------------------
const agendarCita = async (req, res) => {
    // Campo trampa: las personas no lo ven; los bots que llenan todo, sí
    if (req.body.sitio_web) {
        return res.status(400).json({ message: 'No se pudo procesar la solicitud.' });
    }

    const servicio_id = Number(req.body.servicio_id);
    const barbero_id = String(req.body.barbero_id || '');
    const fecha_cita = String(req.body.fecha_cita || '');
    const hora_inicio = String(req.body.hora_inicio || '').slice(0, 5);

    if (!idServicioValido(servicio_id) || !REGEX_UUID.test(barbero_id) || !REGEX_FECHA.test(fecha_cita) || !REGEX_HORA.test(hora_inicio)) {
        return res.status(400).json({ message: 'Faltan datos de la cita (servicio, barbero, fecha u hora).' });
    }
    if (!cumpleAnticipacion(fecha_cita, hora_inicio)) {
        return res.status(400).json({ message: `Las citas en línea se reservan con al menos 24 horas de anticipación. Para antes, llama al ${TELEFONO_BARBERIA}.` });
    }

    // Datos de la persona: de su cuenta o del formulario de invitado
    let persona;
    if (req.user) {
        if (!esCliente(req)) {
            return res.status(403).json({ message: 'Esta sesión es del panel. Agenda desde la agenda del panel.' });
        }
        const u = await pool.query(
            'SELECT id, nombre, apellidos, telefono, email, activo FROM usuarios WHERE id = $1 AND rol_id = $2',
            [req.user.id, ROL_CLIENTE]
        );
        if (u.rows.length === 0 || u.rows[0].activo === false) {
            return res.status(403).json({ message: 'Tu cuenta no está activa.' });
        }
        const c = u.rows[0];
        persona = {
            usuario_id: c.id,
            nombreCompleto: `${c.nombre} ${c.apellidos || ''}`.trim(),
            telefono: c.telefono,
            email: c.email,
            aviso: null // ya lo aceptó al registrarse (queda en usuarios)
        };
    } else {
        const nombre = limpiarTexto(req.body.nombre, 60);
        const apellidos = limpiarTexto(req.body.apellidos, 60);
        const telefono = limpiarTelefono(req.body.telefono);
        const email = String(req.body.email || '').trim().toLowerCase();
        if (nombre.length < 2 || apellidos.length < 2) {
            return res.status(400).json({ message: 'Escribe tu nombre y tus apellidos.' });
        }
        if (!telefono) {
            return res.status(400).json({ message: 'El teléfono debe tener 10 dígitos.' });
        }
        if (!emailValido(email)) {
            return res.status(400).json({ message: 'El correo electrónico no es válido.' });
        }
        if (req.body.acepta_aviso !== true) {
            return res.status(400).json({ message: 'Debes aceptar el aviso de privacidad para agendar.' });
        }
        persona = { usuario_id: null, nombre, apellidos, nombreCompleto: `${nombre} ${apellidos}`, telefono, email, aviso: AVISO_PRIVACIDAD_VERSION };
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const v = await validarHorarioCita(client, { barbero_id, servicio_id, fecha_cita, hora_inicio });
        if (!v.ok) {
            await client.query('ROLLBACK');
            return res.status(v.status).json({ message: v.message });
        }

        // El invitado queda también en "Clientes" del panel (igual que las citas de mostrador)
        if (!persona.usuario_id) {
            await buscarOCrearCliente(client,
                { nombre: persona.nombre, apellidos: persona.apellidos, telefono: persona.telefono, email: persona.email },
                { aviso_privacidad_aceptado_en: new Date(), aviso_privacidad_version: AVISO_PRIVACIDAD_VERSION });
        }

        const ins = await client.query(
            `INSERT INTO citas
                (barbero_id, servicio_id, usuario_id, nombre_invitado, telefono_invitado, email_invitado,
                 fecha_cita, hora_inicio, hora_fin, origen, estado,
                 aviso_privacidad_aceptado_en, aviso_privacidad_version)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8::time + $9 * interval '1 minute', 'WEB', 'CONFIRMADA',
                     CASE WHEN $10::text IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END, $10::text)
             RETURNING id`,
            [barbero_id, servicio_id, persona.usuario_id, persona.nombreCompleto, persona.telefono, persona.email,
             fecha_cita, v.horaInicioStr, v.duracion, persona.aviso]
        );
        await client.query('COMMIT');

        const cita = await pool.query(`${SELECT_CITA_CLIENTE} WHERE c.id = $1`, [ins.rows[0].id]);
        res.status(201).json({ message: 'Tu cita quedó agendada.', cita: cita.rows[0] });
        avisarCita('confirmada', ins.rows[0].id);
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Portal - error al agendar cita:', error);
        res.status(500).json({ message: 'Error interno al agendar la cita.' });
    } finally {
        client.release();
    }
};

// -----------------------------------------------------------------------------
// "Mis citas" (solo rol 3, solo las suyas)
// -----------------------------------------------------------------------------
const misCitas = async (req, res) => {
    try {
        const result = await pool.query(
            `${SELECT_CITA_CLIENTE} WHERE c.usuario_id = $1 ORDER BY c.fecha_cita DESC, c.hora_inicio DESC`,
            [req.user.id]
        );
        const perfil = await pool.query('SELECT nombre, apellidos, email, telefono FROM usuarios WHERE id = $1', [req.user.id]);
        res.json({ cliente: perfil.rows[0] || null, citas: result.rows });
    } catch (error) {
        console.error('Portal - error al obtener mis citas:', error);
        res.status(500).json({ message: 'No se pudieron cargar tus citas.' });
    }
};

/** Explica por qué una cita del cliente ya no se puede cancelar o reprogramar */
const motivoNoModificable = async (db, citaId, usuarioId, accion) => {
    const r = await db.query(
        `SELECT estado, (fecha_cita + hora_inicio) >= LOCALTIMESTAMP + ${HORAS_MIN_CANCELACION} * interval '1 hour' AS a_tiempo
         FROM citas WHERE id = $1 AND usuario_id = $2`,
        [citaId, usuarioId]
    );
    if (r.rows.length === 0) return { status: 404, message: 'Cita no encontrada.' };
    if (!ESTADOS_ACTIVOS.includes(r.rows[0].estado)) return { status: 400, message: 'Esta cita ya no está activa.' };
    if (!r.rows[0].a_tiempo) {
        return { status: 400, message: `Solo puedes ${accion} con al menos ${HORAS_MIN_CANCELACION} horas de anticipación. Llama a la barbería: ${TELEFONO_BARBERIA}.` };
    }
    return null;
};

const cancelarMiCita = async (req, res) => {
    try {
        const { id } = req.params;
        if (!REGEX_UUID.test(String(id))) return res.status(404).json({ message: 'Cita no encontrada.' });

        const result = await pool.query(
            `UPDATE citas
             SET estado = 'CANCELADA', motivo_cancelacion = 'Cancelada por el cliente desde el portal',
                 actualizado_en = CURRENT_TIMESTAMP
             WHERE id = $1 AND usuario_id = $2
               AND estado IN ('PENDIENTE', 'CONFIRMADA')
               AND (fecha_cita + hora_inicio) >= LOCALTIMESTAMP + ${HORAS_MIN_CANCELACION} * interval '1 hour'
             RETURNING id`,
            [id, req.user.id]
        );
        if (result.rowCount === 0) {
            const motivo = await motivoNoModificable(pool, id, req.user.id, 'cancelar');
            return res.status(motivo ? motivo.status : 400).json({ message: motivo ? motivo.message : 'No se pudo cancelar la cita.' });
        }
        res.json({ message: 'Tu cita fue cancelada.' });
        avisarCita('cancelada', id);
    } catch (error) {
        console.error('Portal - error al cancelar cita:', error);
        res.status(500).json({ message: 'Error interno al cancelar la cita.' });
    }
};

const reprogramarMiCita = async (req, res) => {
    const { id } = req.params;
    const fecha_cita = String(req.body.fecha_cita || '');
    const hora_inicio = String(req.body.hora_inicio || '').slice(0, 5);
    if (!REGEX_UUID.test(String(id))) return res.status(404).json({ message: 'Cita no encontrada.' });
    if (!REGEX_FECHA.test(fecha_cita) || !REGEX_HORA.test(hora_inicio)) {
        return res.status(400).json({ message: 'Elige la nueva fecha y hora.' });
    }
    if (req.body.barbero_id && !REGEX_UUID.test(String(req.body.barbero_id))) {
        return res.status(400).json({ message: 'Barbero no válido.' });
    }
    if (!cumpleAnticipacion(fecha_cita, hora_inicio)) {
        return res.status(400).json({ message: 'La nueva hora debe ser con al menos 24 horas de anticipación.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const actual = await client.query(
            `SELECT id, barbero_id, servicio_id FROM citas
             WHERE id = $1 AND usuario_id = $2
               AND estado IN ('PENDIENTE', 'CONFIRMADA')
               AND (fecha_cita + hora_inicio) >= LOCALTIMESTAMP + ${HORAS_MIN_CANCELACION} * interval '1 hour'
             FOR UPDATE`,
            [id, req.user.id]
        );
        if (actual.rows.length === 0) {
            await client.query('ROLLBACK');
            const motivo = await motivoNoModificable(pool, id, req.user.id, 'reprogramar');
            return res.status(motivo ? motivo.status : 400).json({ message: motivo ? motivo.message : 'No se pudo reprogramar la cita.' });
        }
        const cita = actual.rows[0];
        const barbero_id = req.body.barbero_id || cita.barbero_id; // puede cambiar de barbero; el servicio se mantiene

        const v = await validarHorarioCita(client, { barbero_id, servicio_id: cita.servicio_id, fecha_cita, hora_inicio, excluirCitaId: id });
        if (!v.ok) {
            await client.query('ROLLBACK');
            return res.status(v.status).json({ message: v.message });
        }

        await client.query(
            `UPDATE citas
             SET barbero_id = $1, fecha_cita = $2, hora_inicio = $3,
                 hora_fin = $3::time + $4 * interval '1 minute', actualizado_en = CURRENT_TIMESTAMP
             WHERE id = $5`,
            [barbero_id, fecha_cita, v.horaInicioStr, v.duracion, id]
        );
        await client.query('COMMIT');

        const nueva = await pool.query(`${SELECT_CITA_CLIENTE} WHERE c.id = $1`, [id]);
        res.json({ message: 'Tu cita fue reprogramada.', cita: nueva.rows[0] });
        avisarCita('reprogramada', id);
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Portal - error al reprogramar cita:', error);
        res.status(500).json({ message: 'Error interno al reprogramar la cita.' });
    } finally {
        client.release();
    }
};

module.exports = {
    obtenerServicios,
    obtenerBarberos,
    obtenerProductos,
    horariosDisponibles,
    agendarCita,
    misCitas,
    cancelarMiCita,
    reprogramarMiCita
};
