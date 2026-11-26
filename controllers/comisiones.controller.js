const crypto = require('crypto');
require('dotenv').config();

const pool = require('../config/db');

const PORCENTAJE_COMISION_DEFAULT = 65;

/**
 * Función reutilizable para generar la comisión de una cita completada
 * si todavía no existe en la tabla `comisiones`.
 */
const generarComisionPorCita = async (client, citaId, porcentaje = PORCENTAJE_COMISION_DEFAULT) => {
    const existente = await client.query(
        'SELECT id FROM comisiones WHERE cita_id = $1',
        [citaId]
    );
    if (existente.rows.length > 0) {
        return null;
    }

    const citaRes = await client.query(
        `SELECT
            c.id AS cita_id,
            c.barbero_id,
            c.estado,
            s.precio AS monto_servicio
         FROM citas c
         JOIN servicios s ON c.servicio_id = s.id
         WHERE c.id = $1`,
        [citaId]
    );

    if (citaRes.rows.length === 0) return null;
    const cita = citaRes.rows[0];
    if (cita.estado !== 'COMPLETADA' || !cita.barbero_id) return null;

    const montoServicio = Number(cita.monto_servicio || 0);
    const pct = Number(porcentaje);
    const montoComision = Number(((montoServicio * pct) / 100).toFixed(2));
    const comisionId = crypto.randomUUID();

    const insertRes = await client.query(
        `INSERT INTO comisiones
            (id, cita_id, barbero_id, monto_servicio, porcentaje_aplicado, monto_comision, estado, fecha_calculo)
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDIENTE', NOW())
         RETURNING *`,
        [
            comisionId,
            cita.cita_id,
            cita.barbero_id,
            montoServicio.toFixed(2),
            pct.toFixed(2),
            montoComision.toFixed(2)
        ]
    );

    return insertRes.rows[0];
};

/**
 * Calcula y registra comisiones (65% por defecto) para todas las citas COMPLETADA
 * que aún no tengan comisión registrada.
 */
const calcularDesdeCitasCompletadas = async (req, res) => {
    const client = await pool.connect();
    try {
        const pct = req.body && req.body.porcentaje !== undefined
            ? Number(req.body.porcentaje)
            : PORCENTAJE_COMISION_DEFAULT;

        if (Number.isNaN(pct) || pct < 0 || pct > 100) {
            client.release();
            return res.status(400).json({ message: 'Porcentaje inválido' });
        }

        await client.query('BEGIN');

        const citasPendientesComision = await client.query(
            `SELECT c.id
             FROM citas c
             LEFT JOIN comisiones cm ON cm.cita_id = c.id
             WHERE c.estado = 'COMPLETADA'
               AND c.barbero_id IS NOT NULL
               AND cm.id IS NULL`
        );

        let creadas = 0;
        for (const row of citasPendientesComision.rows) {
            const nueva = await generarComisionPorCita(client, row.id, pct);
            if (nueva) creadas++;
        }

        await client.query('COMMIT');
        client.release();

        res.status(200).json({
            message: creadas > 0
                ? `Se calcularon ${creadas} comisión(es) nueva(s) al ${pct}%`
                : 'Todas las citas completadas ya tienen su comisión calculada',
            creadas
        });
    } catch (error) {
        await client.query('ROLLBACK');
        client.release();
        console.error('Error al calcular comisiones desde citas:', error);
        res.status(500).json({ message: 'Error interno al calcular comisiones' });
    }
};

const listarComisiones = async (req, res) => {
    try {
        const estado = (req.query.estado || '').trim().toUpperCase();
        const esAdmin = Number(req.user && (req.user.rol_id || req.user.rol)) === 1;
        // El barbero solo puede consultar sus propias comisiones
        const barberoId = esAdmin ? (req.query.barbero_id || '').trim() : (req.user.barbero_id || '');
        if (!esAdmin && !barberoId) {
            return res.status(403).json({ message: 'Tu usuario no está enlazado a un barbero.' });
        }
        // Periodo opcional (RF-ADM-02: comisiones del periodo), por fecha de la cita
        const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f || ''));
        const desde = fechaValida(req.query.desde) ? req.query.desde : null;
        const hasta = fechaValida(req.query.hasta) ? req.query.hasta : null;

        let query = `
            SELECT
                cm.id,
                cm.cita_id,
                cm.barbero_id,
                b.nombre AS nombre_barbero,
                s.nombre AS nombre_servicio,
                to_char(c.fecha_cita, 'YYYY-MM-DD') AS fecha_cita,
                cm.monto_servicio,
                cm.porcentaje_aplicado,
                cm.monto_comision,
                cm.estado,
                cm.fecha_calculo,
                cm.fecha_liquidacion
            FROM comisiones cm
            LEFT JOIN barberos b ON cm.barbero_id = b.id
            LEFT JOIN citas c ON cm.cita_id = c.id
            LEFT JOIN servicios s ON c.servicio_id = s.id
            WHERE 1=1
        `;
        const params = [];
        let idx = 1;

        if (estado === 'PENDIENTE' || estado === 'PAGADO') {
            query += ` AND cm.estado = $${idx++}`;
            params.push(estado);
        }

        if (barberoId) {
            query += ` AND cm.barbero_id = $${idx++}`;
            params.push(barberoId);
        }

        if (desde) {
            query += ` AND c.fecha_cita >= $${idx++}`;
            params.push(desde);
        }
        if (hasta) {
            query += ` AND c.fecha_cita <= $${idx++}`;
            params.push(hasta);
        }

        query += ` ORDER BY cm.fecha_calculo DESC NULLS LAST, cm.id DESC`;

        const result = await pool.query(query, params);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error al listar comisiones:', error);
        res.status(500).json({ message: 'Error interno al obtener comisiones' });
    }
};

const marcarComisionPagada = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `UPDATE comisiones
             SET estado = 'PAGADO',
                 fecha_liquidacion = NOW()
             WHERE id = $1
             RETURNING *`,
            [id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Comisión no encontrada' });
        }

        res.status(200).json({
            message: 'Comisión marcada como PAGADO',
            comision: result.rows[0]
        });
    } catch (error) {
        console.error('Error al marcar comisión como pagada:', error);
        res.status(500).json({ message: 'Error interno al actualizar comisión' });
    }
};

const liquidarPendientesBarbero = async (req, res) => {
    try {
        const { barbero_id } = req.body;
        if (!barbero_id) {
            return res.status(400).json({ message: 'Falta barbero_id' });
        }

        // Si se manda un periodo, solo se liquidan las comisiones de citas dentro de ese periodo
        const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f || ''));
        const desde = fechaValida(req.body.desde) ? req.body.desde : null;
        const hasta = fechaValida(req.body.hasta) ? req.body.hasta : null;

        const result = await pool.query(
            `UPDATE comisiones cm
             SET estado = 'PAGADO',
                 fecha_liquidacion = NOW()
             FROM citas c
             WHERE c.id = cm.cita_id
               AND cm.barbero_id = $1 AND cm.estado = 'PENDIENTE'
               AND ($2::date IS NULL OR c.fecha_cita >= $2::date)
               AND ($3::date IS NULL OR c.fecha_cita <= $3::date)
             RETURNING cm.*`,
            [barbero_id, desde, hasta]
        );

        res.status(200).json({
            message: `Se liquidaron ${result.rowCount} comisión(es) pendientes del barbero`,
            actualizadas: result.rowCount
        });
    } catch (error) {
        console.error('Error al liquidar comisiones del barbero:', error);
        res.status(500).json({ message: 'Error interno al liquidar comisiones' });
    }
};

module.exports = {
    PORCENTAJE_COMISION_DEFAULT,
    generarComisionPorCita,
    calcularDesdeCitasCompletadas,
    listarComisiones,
    marcarComisionPagada,
    liquidarPendientesBarbero
};