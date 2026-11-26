// =============================================================================
// CapitalHub - Tienda en línea (RF-EC-01, RF-EC-02, RF-EC-03)
//   - Recoger en el local: pago en efectivo al recoger o pago en línea.
//   - Envío dentro de Durango: pago en línea con Mercado Pago.
//   - El stock se aparta al crear el pedido (igual que la venta de mostrador del panel)
//     y regresa si el pedido se cancela o si el pago en línea no se completa a tiempo.
// =============================================================================
const crypto = require('crypto');
const pool = require('../config/db');
const { buscarOCrearCliente, ROL_CLIENTE } = require('./clientes.controller');
const { enviarCorreo, correoPedido } = require('../config/correo');
const mp = require('../config/mercadopago');
const {
    AVISO_PRIVACIDAD_VERSION, COSTO_ENVIO_CIUDAD, COSTO_ENVIO_ESTADO, costoEnvioPorCP, MINUTOS_PARA_PAGAR, MAX_PIEZAS_POR_PRODUCTO,
    REGEX_UUID, limpiarTelefono, limpiarTexto, emailValido
} = require('../config/portal');

const folioDe = (id) => String(id).slice(0, 8).toUpperCase();
const redondear = (n) => Math.round(Number(n) * 100) / 100;
const esCliente = (req) => req.user && Number(req.user.rol_id || req.user.rol) === ROL_CLIENTE;

// -----------------------------------------------------------------------------
// Configuración pública (para que la página sepa qué opciones mostrar)
// -----------------------------------------------------------------------------
const configTienda = (req, res) => {
    res.json({
        pago_en_linea: mp.pagoEnLineaActivo(),
        costo_envio_ciudad: COSTO_ENVIO_CIUDAD,
        costo_envio_estado: COSTO_ENVIO_ESTADO,
        minutos_para_pagar: MINUTOS_PARA_PAGAR,
        max_piezas: MAX_PIEZAS_POR_PRODUCTO
    });
};

// -----------------------------------------------------------------------------
// Utilidades internas
// -----------------------------------------------------------------------------
async function itemsDeVenta(db, ventaId) {
    const r = await db.query(
        `SELECT dv.producto_id AS id, p.nombre, dv.cantidad, dv.precio_unitario
         FROM detalle_ventas dv JOIN productos p ON p.id = dv.producto_id
         WHERE dv.venta_id = $1 ORDER BY p.nombre`,
        [ventaId]
    );
    return r.rows.map(i => ({ ...i, cantidad: Number(i.cantidad), precio_unitario: Number(i.precio_unitario) }));
}

/** Manda el correo de confirmación del pedido una sola vez */
async function notificarPedido(ventaId) {
    try {
        const marca = await pool.query(
            `UPDATE ventas SET notificacion_enviada = true
             WHERE id = $1 AND notificacion_enviada = false
             RETURNING id, nombre_comprador, email_comprador, tipo_entrega, metodo_pago, subtotal, costo_envio, total`,
            [ventaId]
        );
        const v = marca.rows[0];
        if (!v) return;
        const items = await itemsDeVenta(pool, ventaId);
        const { asunto, html } = correoPedido({ ...v, folio: folioDe(v.id), items }, String(v.nombre_comprador).split(' ')[0]);
        const enviado = await enviarCorreo({ para: v.email_comprador, nombre: v.nombre_comprador, asunto, html });
        if (!enviado) await pool.query('UPDATE ventas SET notificacion_enviada = false WHERE id = $1', [ventaId]);
    } catch (e) {
        console.error('Tienda - correo de pedido:', e.message);
    }
}

/** Cancela un pedido pendiente y regresa su stock (dentro de una transacción) */
async function cancelarConDevolucion(client, ventaId) {
    const det = await client.query('SELECT producto_id, cantidad FROM detalle_ventas WHERE venta_id = $1', [ventaId]);
    for (const d of det.rows) {
        await client.query('UPDATE productos SET stock_actual = stock_actual + $1 WHERE id = $2', [Number(d.cantidad), Number(d.producto_id)]);
    }
    await client.query("UPDATE ventas SET estado = 'CANCELADA' WHERE id = $1", [ventaId]);
}

/**
 * Aplica a la venta el resultado de un pago de Mercado Pago.
 * Solo se marca PAGADA si el pago está aprobado, es en MXN y el monto coincide con el total.
 */
async function aplicarPago(ventaId, pago) {
    if (!REGEX_UUID.test(String(ventaId || ''))) return null;
    const client = await pool.connect();
    let pagada = false;
    try {
        await client.query('BEGIN');
        const r = await client.query(
            "SELECT id, estado, total, metodo_pago FROM ventas WHERE id = $1 FOR UPDATE", [ventaId]
        );
        const venta = r.rows[0];
        if (!venta || venta.metodo_pago !== 'PASARELA_ONLINE') { await client.query('ROLLBACK'); return null; }

        const aprobado = pago && pago.status === 'approved'
            && pago.currency_id === 'MXN'
            && Math.abs(Number(pago.transaction_amount) - Number(venta.total)) < 0.01;

        if (aprobado && venta.estado === 'PENDIENTE') {
            await client.query(
                "UPDATE ventas SET estado = 'PAGADA', pasarela_referencia_id = $1 WHERE id = $2",
                [String(pago.id), ventaId]
            );
            pagada = true;
        } else if (aprobado && venta.estado === 'CANCELADA') {
            // Pagó justo cuando vencía: intentamos apartar otra vez el stock
            const det = await client.query('SELECT producto_id, cantidad FROM detalle_ventas WHERE venta_id = $1 ORDER BY producto_id', [ventaId]);
            let alcanza = true;
            for (const d of det.rows) {
                const p = await client.query('SELECT stock_actual FROM productos WHERE id = $1 FOR UPDATE', [d.producto_id]);
                if (!p.rows[0] || Number(p.rows[0].stock_actual) < Number(d.cantidad)) alcanza = false;
            }
            if (alcanza) {
                for (const d of det.rows) {
                    await client.query('UPDATE productos SET stock_actual = stock_actual - $1 WHERE id = $2', [Number(d.cantidad), d.producto_id]);
                }
                await client.query("UPDATE ventas SET estado = 'PAGADA', pasarela_referencia_id = $1 WHERE id = $2", [String(pago.id), ventaId]);
                pagada = true;
            } else {
                await client.query('UPDATE ventas SET pasarela_referencia_id = $1 WHERE id = $2', [String(pago.id), ventaId]);
                console.error(`⚠️ Pedido ${folioDe(ventaId)}: pago aprobado (${pago.id}) pero ya no hay stock. Hay que reembolsar desde Mercado Pago.`);
            }
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Tienda - error al aplicar pago:', e.message);
    } finally {
        client.release();
    }
    if (pagada) notificarPedido(ventaId);
    return pagada;
}

/** Pregunta a Mercado Pago si ya se pagó la venta (sirve en localhost, sin webhook) */
async function verificarPagoDeVenta(ventaId) {
    if (!mp.pagoEnLineaActivo()) return;
    try {
        const pagos = await mp.buscarPagosDeVenta(ventaId);
        const aprobado = pagos.find(p => p.status === 'approved');
        if (aprobado) await aplicarPago(ventaId, aprobado);
    } catch (e) {
        console.error('Tienda - no se pudo consultar Mercado Pago:', e.message);
    }
}

// -----------------------------------------------------------------------------
// Crear pedido (invitado o cliente con sesión)
// -----------------------------------------------------------------------------
const crearPedido = async (req, res) => {
    if (req.body.sitio_web) return res.status(400).json({ message: 'No se pudo procesar la solicitud.' });

    // 1. Productos (se juntan si vienen repetidos)
    const cantidades = new Map();
    for (const it of Array.isArray(req.body.items) ? req.body.items : []) {
        const id = Number(it && it.producto_id);
        const cant = Number(it && it.cantidad);
        if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(cant) || cant <= 0) {
            return res.status(400).json({ message: 'Hay un producto o cantidad no válida en el carrito.' });
        }
        cantidades.set(id, (cantidades.get(id) || 0) + cant);
    }
    if (cantidades.size === 0 || cantidades.size > 20) {
        return res.status(400).json({ message: 'El carrito está vacío.' });
    }
    for (const cant of cantidades.values()) {
        if (cant > MAX_PIEZAS_POR_PRODUCTO) {
            return res.status(400).json({ message: `Máximo ${MAX_PIEZAS_POR_PRODUCTO} piezas por producto en línea. Para más, visítanos en la barbería.` });
        }
    }

    // 2. Entrega y pago
    const tipo_entrega = req.body.tipo_entrega === 'ENVIO_LOCAL_ESTATAL' ? 'ENVIO_LOCAL_ESTATAL' : 'RECOGER_LOCAL';
    const metodo_pago = req.body.metodo_pago === 'PASARELA_ONLINE' ? 'PASARELA_ONLINE' : 'EFECTIVO_LOCAL';
    if (tipo_entrega === 'ENVIO_LOCAL_ESTATAL' && metodo_pago !== 'PASARELA_ONLINE') {
        return res.status(400).json({ message: 'Los envíos se pagan en línea con Mercado Pago.' });
    }
    if (metodo_pago === 'PASARELA_ONLINE' && !mp.pagoEnLineaActivo()) {
        return res.status(503).json({ message: 'El pago en línea no está disponible en este momento. Elige recoger y pagar en el local.' });
    }
    let direccion = { municipio: null, cp: null, calle: null, colonia: null, referencias: null };
    if (tipo_entrega === 'ENVIO_LOCAL_ESTATAL') {
        direccion = {
            municipio: limpiarTexto(req.body.municipio, 100),
            cp: String(req.body.codigo_postal || '').trim(),
            calle: limpiarTexto(req.body.direccion_calle, 200),
            colonia: limpiarTexto(req.body.colonia, 150),
            referencias: limpiarTexto(req.body.referencias, 255) || null
        };
        if (!direccion.municipio || !direccion.calle || !direccion.colonia) {
            return res.status(400).json({ message: 'Escribe la calle y número, la colonia y el municipio del envío.' });
        }
        if (costoEnvioPorCP(direccion.cp) === null) {
            return res.status(400).json({ message: 'Solo enviamos dentro del estado de Durango (códigos postales del 34000 al 35999).' });
        }
    }

    // 3. Datos de quien compra
    let comprador;
    if (req.user) {
        if (!esCliente(req)) return res.status(403).json({ message: 'Esta sesión es del panel. Registra la venta desde el catálogo del panel.' });
        const u = await pool.query('SELECT id, nombre, apellidos, telefono, email, activo FROM usuarios WHERE id = $1 AND rol_id = $2', [req.user.id, ROL_CLIENTE]);
        if (!u.rows[0] || u.rows[0].activo === false) return res.status(403).json({ message: 'Tu cuenta no está activa.' });
        const c = u.rows[0];
        comprador = { usuario_id: c.id, nombre: `${c.nombre} ${c.apellidos || ''}`.trim(), telefono: c.telefono, email: c.email, aviso: null };
    } else {
        const nombre = limpiarTexto(req.body.nombre, 60);
        const apellidos = limpiarTexto(req.body.apellidos, 60);
        const telefono = limpiarTelefono(req.body.telefono);
        const email = String(req.body.email || '').trim().toLowerCase();
        if (nombre.length < 2 || apellidos.length < 2) return res.status(400).json({ message: 'Escribe tu nombre y tus apellidos.' });
        if (!telefono) return res.status(400).json({ message: 'El teléfono debe tener 10 dígitos.' });
        if (!emailValido(email)) return res.status(400).json({ message: 'El correo electrónico no es válido.' });
        if (req.body.acepta_aviso !== true) return res.status(400).json({ message: 'Debes aceptar el aviso de privacidad para comprar.' });
        comprador = { usuario_id: null, nombre, apellidos, nombreCompleto: `${nombre} ${apellidos}`, telefono, email, aviso: AVISO_PRIVACIDAD_VERSION };
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 4. Revisar y apartar stock (en orden de id para evitar bloqueos cruzados)
        const ids = [...cantidades.keys()].sort((a, b) => a - b);
        const prods = await client.query(
            'SELECT id, nombre, precio, stock_actual, activo FROM productos WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE',
            [ids]
        );
        if (prods.rows.length !== ids.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Uno de los productos ya no existe. Actualiza la página.' });
        }
        const items = [];
        for (const p of prods.rows) {
            const cant = cantidades.get(p.id);
            if (!p.activo) { await client.query('ROLLBACK'); return res.status(400).json({ message: `"${p.nombre}" ya no está a la venta.` }); }
            if (Number(p.stock_actual) < cant) {
                await client.query('ROLLBACK');
                return res.status(409).json({ message: `Solo quedan ${p.stock_actual} de "${p.nombre}".`, producto_id: p.id, disponible: Number(p.stock_actual) });
            }
            items.push({ id: p.id, nombre: p.nombre, cantidad: cant, precio_unitario: Number(p.precio) });
        }
        const subtotal = redondear(items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0));
        const costo_envio = tipo_entrega === 'ENVIO_LOCAL_ESTATAL' ? costoEnvioPorCP(direccion.cp) : 0;
        const total = redondear(subtotal + costo_envio);

        // El invitado queda también en "Clientes" del panel
        if (!comprador.usuario_id) {
            await buscarOCrearCliente(client,
                { nombre: comprador.nombre, apellidos: comprador.apellidos, telefono: comprador.telefono, email: comprador.email },
                { aviso_privacidad_aceptado_en: new Date(), aviso_privacidad_version: AVISO_PRIVACIDAD_VERSION });
        }

        // 5. Guardar venta, detalle y descontar stock
        const ventaId = crypto.randomUUID();
        await client.query(
            `INSERT INTO ventas
                (id, usuario_id, nombre_comprador, email_comprador, telefono_comprador, tipo_entrega,
                 estado_republica, municipio_ciudad, codigo_postal, direccion_calle, colonia, referencias_domicilio,
                 costo_envio, metodo_pago, estado, subtotal, total, notificacion_enviada,
                 aviso_privacidad_aceptado_en, aviso_privacidad_version)
             VALUES ($1, $2, $3, $4, $5, $6, 'Durango', $7, $8, $9, $10, $11, $12, $13, 'PENDIENTE', $14, $15, false,
                     CASE WHEN $16::text IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END, $16::text)`,
            [ventaId, comprador.usuario_id, comprador.nombreCompleto || comprador.nombre, comprador.email, comprador.telefono, tipo_entrega,
             direccion.municipio, direccion.cp, direccion.calle, direccion.colonia, direccion.referencias,
             costo_envio, metodo_pago, subtotal, total, comprador.aviso]
        );
        for (const i of items) {
            await client.query('INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario) VALUES ($1, $2, $3, $4)', [ventaId, i.id, i.cantidad, i.precio_unitario]);
            await client.query('UPDATE productos SET stock_actual = stock_actual - $1 WHERE id = $2', [i.cantidad, i.id]);
        }

        // 6. Pago en línea: se crea la preferencia antes de confirmar (si falla, no queda el pedido)
        let urlPago = null;
        if (metodo_pago === 'PASARELA_ONLINE') {
            const pref = await mp.crearPreferencia({ id: ventaId, items, costo_envio }, MINUTOS_PARA_PAGAR);
            urlPago = pref.urlPago;
            await client.query('UPDATE ventas SET pasarela_preferencia_id = $1 WHERE id = $2', [pref.preferenciaId, ventaId]);
        }

        await client.query('COMMIT');
        res.status(201).json({
            message: metodo_pago === 'PASARELA_ONLINE' ? 'Pedido creado. Te llevamos a Mercado Pago para pagar.' : 'Pedido recibido. Paga en efectivo al recogerlo.',
            venta_id: ventaId,
            folio: folioDe(ventaId),
            total,
            url_pago: urlPago
        });
        if (metodo_pago === 'EFECTIVO_LOCAL') notificarPedido(ventaId);
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error.status) { // error de Mercado Pago
            console.error('Tienda - Mercado Pago:', error.message);
            return res.status(502).json({ message: 'No se pudo iniciar el pago con Mercado Pago. Intenta de nuevo en unos minutos.' });
        }
        console.error('Tienda - error al crear pedido:', error);
        res.status(500).json({ message: 'Error interno al crear el pedido.' });
    } finally {
        client.release();
    }
};

// -----------------------------------------------------------------------------
// Consultar un pedido por su id (enlace que recibe quien compra). Sin datos personales.
// -----------------------------------------------------------------------------
const verPedido = async (req, res) => {
    try {
        const { id } = req.params;
        if (!REGEX_UUID.test(String(id))) return res.status(404).json({ message: 'Pedido no encontrado.' });

        let r = await pool.query('SELECT estado, metodo_pago FROM ventas WHERE id = $1', [id]);
        if (r.rows.length === 0) return res.status(404).json({ message: 'Pedido no encontrado.' });
        if (r.rows[0].estado === 'PENDIENTE' && r.rows[0].metodo_pago === 'PASARELA_ONLINE') {
            await verificarPagoDeVenta(id);
        }

        r = await pool.query(
            `SELECT id, estado, metodo_pago, tipo_entrega, subtotal, costo_envio, total, creado_en, pasarela_preferencia_id,
                    (creado_en + ${MINUTOS_PARA_PAGAR} * interval '1 minute') AS vence_en,
                    (creado_en + ${MINUTOS_PARA_PAGAR} * interval '1 minute') > CURRENT_TIMESTAMP AS a_tiempo
             FROM ventas WHERE id = $1`,
            [id]
        );
        const v = r.rows[0];
        const items = await itemsDeVenta(pool, id);
        res.json({
            folio: folioDe(v.id),
            estado: v.estado,
            metodo_pago: v.metodo_pago,
            tipo_entrega: v.tipo_entrega,
            subtotal: Number(v.subtotal),
            costo_envio: Number(v.costo_envio),
            total: Number(v.total),
            creado_en: v.creado_en,
            vence_en: v.vence_en,
            puede_pagar: v.estado === 'PENDIENTE' && v.metodo_pago === 'PASARELA_ONLINE' && v.a_tiempo && mp.pagoEnLineaActivo(),
            items
        });
    } catch (error) {
        console.error('Tienda - error al consultar pedido:', error);
        res.status(500).json({ message: 'No se pudo consultar el pedido.' });
    }
};

/** Vuelve a abrir el pago de un pedido pendiente (si cerró la ventana de Mercado Pago) */
const reanudarPago = async (req, res) => {
    try {
        const { id } = req.params;
        if (!REGEX_UUID.test(String(id))) return res.status(404).json({ message: 'Pedido no encontrado.' });
        const r = await pool.query(
            `SELECT id, estado, metodo_pago, costo_envio,
                    (creado_en + ${MINUTOS_PARA_PAGAR} * interval '1 minute') > CURRENT_TIMESTAMP AS a_tiempo
             FROM ventas WHERE id = $1`, [id]
        );
        const v = r.rows[0];
        if (!v || v.metodo_pago !== 'PASARELA_ONLINE') return res.status(404).json({ message: 'Pedido no encontrado.' });
        if (v.estado !== 'PENDIENTE' || !v.a_tiempo) return res.status(400).json({ message: 'Este pedido ya no se puede pagar.' });
        const items = await itemsDeVenta(pool, id);
        const pref = await mp.crearPreferencia({ id, items, costo_envio: Number(v.costo_envio) }, MINUTOS_PARA_PAGAR);
        await pool.query('UPDATE ventas SET pasarela_preferencia_id = $1 WHERE id = $2', [pref.preferenciaId, id]);
        res.json({ url_pago: pref.urlPago });
    } catch (error) {
        console.error('Tienda - error al reanudar pago:', error.message);
        res.status(502).json({ message: 'No se pudo abrir Mercado Pago. Intenta de nuevo.' });
    }
};

// -----------------------------------------------------------------------------
// Aviso (webhook) de Mercado Pago. Nunca confiamos en lo que trae: consultamos el pago.
// -----------------------------------------------------------------------------
const webhookMercadoPago = async (req, res) => {
    res.sendStatus(200); // Mercado Pago solo necesita saber que lo recibimos
    try {
        const tipo = req.body && (req.body.type || req.body.topic) || req.query.type || req.query.topic;
        const pagoId = (req.body && req.body.data && req.body.data.id) || req.query['data.id'] || req.query.id;
        if (tipo !== 'payment' || !pagoId || !mp.pagoEnLineaActivo()) return;
        const pago = await mp.obtenerPago(pagoId);
        await aplicarPago(pago.external_reference, pago);
    } catch (e) {
        console.error('Tienda - webhook de Mercado Pago:', e.message);
    }
};

// -----------------------------------------------------------------------------
// Pedidos del cliente (rol 3)
// -----------------------------------------------------------------------------
const misPedidos = async (req, res) => {
    try {
        const r = await pool.query(
            `SELECT v.id, v.estado, v.metodo_pago, v.tipo_entrega, v.total, v.creado_en,
                    COALESCE(json_agg(json_build_object('nombre', p.nombre, 'cantidad', dv.cantidad)) FILTER (WHERE dv.id IS NOT NULL), '[]') AS items
             FROM ventas v
             LEFT JOIN detalle_ventas dv ON dv.venta_id = v.id
             LEFT JOIN productos p ON p.id = dv.producto_id
             WHERE v.usuario_id = $1
             GROUP BY v.id
             ORDER BY v.creado_en DESC
             LIMIT 30`,
            [req.user.id]
        );
        res.json(r.rows.map(v => ({ ...v, folio: folioDe(v.id), total: Number(v.total) })));
    } catch (error) {
        console.error('Tienda - error en mis pedidos:', error);
        res.status(500).json({ message: 'No se pudieron cargar tus pedidos.' });
    }
};

// -----------------------------------------------------------------------------
// Tarea periódica: cancela pedidos en línea que no se pagaron a tiempo y regresa su stock
// -----------------------------------------------------------------------------
async function cancelarPedidosVencidos() {
    try {
        const vencidos = await pool.query(
            `SELECT id FROM ventas
             WHERE estado = 'PENDIENTE' AND metodo_pago = 'PASARELA_ONLINE'
               AND creado_en < CURRENT_TIMESTAMP - ${MINUTOS_PARA_PAGAR + 5} * interval '1 minute'`
        );
        for (const { id } of vencidos.rows) {
            await verificarPagoDeVenta(id); // por si pagó en el último momento
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const v = await client.query("SELECT estado FROM ventas WHERE id = $1 FOR UPDATE", [id]);
                if (v.rows[0] && v.rows[0].estado === 'PENDIENTE') {
                    await cancelarConDevolucion(client, id);
                    console.log(`🧾 Pedido ${folioDe(id)} cancelado: no se pagó a tiempo (stock devuelto).`);
                }
                await client.query('COMMIT');
            } catch (e) {
                await client.query('ROLLBACK').catch(() => {});
                throw e;
            } finally {
                client.release();
            }
        }
    } catch (e) {
        console.error('Tienda - revisión de pedidos vencidos:', e.message);
    }
}

function iniciarTareasTienda() {
    setInterval(cancelarPedidosVencidos, 5 * 60 * 1000).unref();
    setTimeout(cancelarPedidosVencidos, 15 * 1000).unref();
}

module.exports = {
    configTienda, crearPedido, verPedido, reanudarPago, webhookMercadoPago, misPedidos,
    iniciarTareasTienda, cancelarPedidosVencidos, aplicarPago
};
