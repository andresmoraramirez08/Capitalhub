const crypto = require('crypto');
require('dotenv').config();

const pool = require('../config/db');

const listarCategorias = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, nombre, descripcion FROM categorias_productos ORDER BY nombre ASC'
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error al listar categorías:', error);
        res.status(500).json({ message: 'Error interno al obtener categorías' });
    }
};

const crearCategoria = async (req, res) => {
    try {
        const { nombre, descripcion } = req.body;
        if (!nombre || !nombre.trim()) {
            return res.status(400).json({ message: 'El nombre de la categoría es obligatorio' });
        }

        const result = await pool.query(
            `INSERT INTO categorias_productos (nombre, descripcion)
             VALUES ($1, $2)
             RETURNING id, nombre, descripcion`,
            [nombre.trim(), (descripcion || '').trim() || null]
        );

        res.status(201).json({ message: 'Categoría creada', categoria: result.rows[0] });
    } catch (error) {
        console.error('Error al crear categoría:', error);
        res.status(500).json({ message: 'Error interno al crear categoría' });
    }
};

const listarProductos = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                p.id,
                p.categoria_id,
                c.nombre AS categoria_nombre,
                p.sku,
                p.nombre,
                p.descripcion,
                p.precio,
                p.stock_actual,
                p.stock_minimo,
                p.activo,
                p.creado_en
             FROM productos p
             LEFT JOIN categorias_productos c ON p.categoria_id = c.id
             ORDER BY p.id DESC`
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error al listar productos:', error);
        res.status(500).json({ message: 'Error interno al obtener productos' });
    }
};

const crearProducto = async (req, res) => {
    try {
        const {
            categoria_id,
            sku,
            nombre,
            descripcion,
            precio,
            stock_actual,
            stock_minimo,
            activo
        } = req.body;

        if (!nombre || !nombre.trim() || precio === undefined || Number(precio) < 0) {
            return res.status(400).json({ message: 'Nombre y precio válido son obligatorios' });
        }

        const result = await pool.query(
            `INSERT INTO productos
                (categoria_id, sku, nombre, descripcion, precio, stock_actual, stock_minimo, activo)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                categoria_id ? Number(categoria_id) : null,
                // Si no se captura SKU se genera uno automático (la columna es obligatoria y única)
                (sku || '').trim() || `PROD-${Date.now().toString(36).toUpperCase()}`,
                nombre.trim(),
                (descripcion || '').trim() || null,
                Number(precio),
                stock_actual !== undefined && stock_actual !== '' ? Number(stock_actual) : 0,
                stock_minimo !== undefined && stock_minimo !== '' ? Number(stock_minimo) : 0,
                activo !== undefined ? Boolean(activo) : true
            ]
        );

        res.status(201).json({ message: 'Producto registrado con éxito', producto: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ message: 'Ese SKU ya lo usa otro producto.' });
        }
        console.error('Error al crear producto:', error);
        res.status(500).json({ message: 'Error interno al crear producto' });
    }
};

const actualizarProducto = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            categoria_id,
            sku,
            nombre,
            descripcion,
            precio,
            stock_actual,
            stock_minimo,
            activo
        } = req.body;

        const campos = [];
        const valores = [];
        let idx = 1;

        if (categoria_id !== undefined) {
            campos.push(`categoria_id = $${idx++}`);
            valores.push(categoria_id ? Number(categoria_id) : null);
        }
        // El SKU es obligatorio: si llega vacío se conserva el actual
        if (sku !== undefined && String(sku).trim()) {
            campos.push(`sku = $${idx++}`);
            valores.push(String(sku).trim());
        }
        if (nombre !== undefined) {
            if (!String(nombre).trim()) {
                return res.status(400).json({ message: 'El nombre no puede estar vacío' });
            }
            campos.push(`nombre = $${idx++}`);
            valores.push(String(nombre).trim());
        }
        if (descripcion !== undefined) {
            campos.push(`descripcion = $${idx++}`);
            valores.push((descripcion || '').trim() || null);
        }
        if (precio !== undefined && precio !== '') {
            if (Number(precio) < 0) {
                return res.status(400).json({ message: 'El precio no puede ser negativo' });
            }
            campos.push(`precio = $${idx++}`);
            valores.push(Number(precio));
        }
        if (stock_actual !== undefined && stock_actual !== '') {
            if (Number(stock_actual) < 0) {
                return res.status(400).json({ message: 'El stock no puede ser negativo' });
            }
            campos.push(`stock_actual = $${idx++}`);
            valores.push(Number(stock_actual));
        }
        if (stock_minimo !== undefined && stock_minimo !== '') {
            if (Number(stock_minimo) < 0) {
                return res.status(400).json({ message: 'El stock mínimo no puede ser negativo' });
            }
            campos.push(`stock_minimo = $${idx++}`);
            valores.push(Number(stock_minimo));
        }
        if (activo !== undefined) {
            campos.push(`activo = $${idx++}`);
            valores.push(Boolean(activo));
        }

        if (campos.length === 0) {
            return res.status(400).json({ message: 'No hay cambios para actualizar' });
        }

        valores.push(Number(id));
        const result = await pool.query(
            `UPDATE productos SET ${campos.join(', ')} WHERE id = $${idx} RETURNING *`,
            valores
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }

        res.status(200).json({ message: 'Producto actualizado', producto: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ message: 'Ese SKU ya lo usa otro producto.' });
        }
        console.error('Error al actualizar producto:', error);
        res.status(500).json({ message: 'Error interno al actualizar producto' });
    }
};

const registrarVentaRapida = async (req, res) => {
    const client = await pool.connect();
    try {
        const {
            producto_id,
            cantidad,
            nombre_comprador,
            telefono_comprador,
            email_comprador,
            tipo_entrega,
            metodo_pago,
            estado
        } = req.body;

        // Métodos de pago en mostrador: efectivo o tarjeta en terminal (PASARELA_ONLINE es para la tienda web)
        const METODOS_PAGO = ['EFECTIVO_LOCAL', 'TARJETA_LOCAL', 'PASARELA_ONLINE'];
        if (metodo_pago && !METODOS_PAGO.includes(metodo_pago)) {
            client.release();
            return res.status(400).json({ message: 'Método de pago no válido' });
        }

        const cant = Number(cantidad);
        if (!producto_id || !Number.isInteger(cant) || cant <= 0) {
            client.release();
            return res.status(400).json({ message: 'Selecciona un producto y una cantidad válida (mayor a 0)' });
        }

        await client.query('BEGIN');

        const prodRes = await client.query(
            'SELECT id, nombre, precio, stock_actual, activo FROM productos WHERE id = $1 FOR UPDATE',
            [Number(producto_id)]
        );

        if (prodRes.rows.length === 0) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).json({ message: 'Producto no encontrado' });
        }

        const prod = prodRes.rows[0];
        if (!prod.activo) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({ message: 'El producto está inactivo' });
        }

        if (Number(prod.stock_actual) < cant) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({
                message: `Stock insuficiente. Disponible: ${prod.stock_actual}`
            });
        }

        const precioUnitario = Number(prod.precio);
        const subtotal = Number((precioUnitario * cant).toFixed(2));
        const total = subtotal;
        const ventaId = crypto.randomUUID();
        const usuarioId = req.user && req.user.id ? req.user.id : null;

        await client.query(
            `INSERT INTO ventas
                (id, usuario_id, nombre_comprador, email_comprador, telefono_comprador,
                 tipo_entrega, costo_envio, metodo_pago, estado, subtotal, total, notificacion_enviada)
             VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, $10, false)`,
            [
                ventaId,
                usuarioId,
                (nombre_comprador || 'Cliente en mostrador').trim(),
                (email_comprador || '').trim() || 'mostrador@capitalhub.local',
                // Venta de mostrador: la columna es obligatoria, se usa un valor genérico si no se captura
                (telefono_comprador || '').trim() || 'MOSTRADOR',
                tipo_entrega || 'RECOGER_LOCAL',
                metodo_pago || 'EFECTIVO_LOCAL',
                estado || 'ENTREGADA',
                subtotal,
                total
            ]
        );

        await client.query(
            `INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario)
             VALUES ($1, $2, $3, $4)`,
            [ventaId, prod.id, cant, precioUnitario]
        );

        const prodActualizado = await client.query(
            `UPDATE productos
             SET stock_actual = stock_actual - $1
             WHERE id = $2
             RETURNING *`,
            [cant, prod.id]
        );

        await client.query('COMMIT');
        client.release();

        res.status(201).json({
            message: `Venta registrada (${cant}x ${prod.nombre})`,
            venta_id: ventaId,
            total,
            producto: prodActualizado.rows[0]
        });
    } catch (error) {
        await client.query('ROLLBACK');
        client.release();
        // 22P02 = valor fuera del ENUM (falta agregar TARJETA_LOCAL a tipo_metodo_pago en la base)
        if (error.code === '22P02') {
            return res.status(400).json({ message: 'La base de datos aún no acepta ese método de pago. Corre el SQL de actualización.' });
        }
        console.error('Error al registrar venta rápida:', error);
        res.status(500).json({ message: 'Error interno al registrar la venta' });
    }
};

const listarVentas = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                v.id,
                v.nombre_comprador,
                v.telefono_comprador,
                v.email_comprador,
                v.tipo_entrega,
                v.metodo_pago,
                v.estado,
                v.subtotal,
                v.total,
                v.creado_en,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'producto_id', dv.producto_id,
                            'producto_nombre', p.nombre,
                            'cantidad', dv.cantidad,
                            'precio_unitario', dv.precio_unitario
                        )
                    ) FILTER (WHERE dv.id IS NOT NULL),
                    '[]'::json
                ) AS items
             FROM ventas v
             LEFT JOIN detalle_ventas dv ON dv.venta_id = v.id
             LEFT JOIN productos p ON p.id = dv.producto_id
             GROUP BY v.id
             ORDER BY v.creado_en DESC
             LIMIT 50`
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error al listar ventas:', error);
        res.status(500).json({ message: 'Error interno al obtener ventas' });
    }
};

const cambiarEstadoVenta = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { estado } = req.body;
        const estadosValidos = ['PENDIENTE', 'PAGADA', 'EN_CAMINO', 'ENTREGADA', 'CANCELADA'];

        if (!estadosValidos.includes(estado)) {
            client.release();
            return res.status(400).json({ message: 'Estado de venta no válido' });
        }

        await client.query('BEGIN');

        const ventaRes = await client.query(
            'SELECT id, estado FROM ventas WHERE id = $1 FOR UPDATE',
            [id]
        );

        if (ventaRes.rows.length === 0) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).json({ message: 'Venta no encontrada' });
        }

        const estadoAnterior = ventaRes.rows[0].estado;

        if (estado === 'CANCELADA' && estadoAnterior !== 'CANCELADA') {
            const detallesRes = await client.query(
                'SELECT producto_id, cantidad FROM detalle_ventas WHERE venta_id = $1',
                [id]
            );
            for (const det of detallesRes.rows) {
                await client.query(
                    'UPDATE productos SET stock_actual = stock_actual + $1 WHERE id = $2',
                    [Number(det.cantidad), Number(det.producto_id)]
                );
            }
        }

        const actualizada = await client.query(
            'UPDATE ventas SET estado = $1 WHERE id = $2 RETURNING *',
            [estado, id]
        );

        await client.query('COMMIT');
        client.release();

        res.status(200).json({
            message: estado === 'CANCELADA'
                ? 'Venta cancelada y stock devuelto al inventario'
                : 'Estado de venta actualizado',
            venta: actualizada.rows[0]
        });
    } catch (error) {
        await client.query('ROLLBACK');
        client.release();
        console.error('Error al cambiar estado de venta:', error);
        res.status(500).json({ message: 'Error interno al actualizar la venta' });
    }
};

module.exports = {
    listarCategorias,
    crearCategoria,
    listarProductos,
    crearProducto,
    actualizarProducto,
    registrarVentaRapida,
    listarVentas,
    cambiarEstadoVenta
};