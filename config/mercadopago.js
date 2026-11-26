// =============================================================================
// CapitalHub - Pagos en línea con Mercado Pago (Checkout Pro, API de preferencias)
// Variables en .env:
//   MP_ACCESS_TOKEN=APP_USR-...   (Access Token de PRUEBA: Tus integraciones > Pruebas > Credenciales de prueba)
//   URL_PUBLICA=https://...       (solo en el hosting: dirección pública con HTTPS)
// Mercado Pago solo acepta direcciones de regreso y de aviso (webhook) con HTTPS.
// En localhost no hay HTTPS: el cliente regresa con el botón del sitio y el pago se
// verifica consultando a Mercado Pago (ver verificarPagoDeVenta en tienda.controller.js).
// Las tarjetas NUNCA pasan por nuestro servidor (RNF-SEG-01, PCI-DSS).
// =============================================================================
require('dotenv').config();

const API = 'https://api.mercadopago.com';

const pagoEnLineaActivo = () => Boolean(process.env.MP_ACCESS_TOKEN);
const urlPublicaHttps = () => {
    const u = String(process.env.URL_PUBLICA || '').replace(/\/+$/, '');
    return u.startsWith('https://') ? u : '';
};

async function llamarMP(metodo, ruta, cuerpo) {
    const resp = await fetch(API + ruta, {
        method: metodo,
        headers: {
            Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        signal: AbortSignal.timeout(15000)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        const error = new Error(`Mercado Pago respondió ${resp.status}: ${data.message || data.error || 'error'}`);
        error.status = resp.status;
        throw error;
    }
    return data;
}

/**
 * Crea la preferencia de pago de una venta.
 * venta: { id, items: [{ id, nombre, cantidad, precio_unitario }], costo_envio }
 * Regresa { preferenciaId, urlPago }.
 */
async function crearPreferencia(venta, minutosParaPagar) {
    const base = urlPublicaHttps();
    const vence = new Date(Date.now() + minutosParaPagar * 60 * 1000).toISOString();
    const items = venta.items.map(i => ({
        id: String(i.id),
        title: i.nombre.slice(0, 250),
        quantity: Number(i.cantidad),
        unit_price: Number(i.precio_unitario),
        currency_id: 'MXN'
    }));
    if (Number(venta.costo_envio) > 0) {
        items.push({ id: 'envio', title: 'Envío dentro del estado de Durango', quantity: 1, unit_price: Number(venta.costo_envio), currency_id: 'MXN' });
    }

    const preferencia = {
        items,
        external_reference: venta.id,           // así relacionamos el pago con la venta
        statement_descriptor: 'CAPITALBARBER',  // máximo 13 caracteres
        expires: true,
        expiration_date_to: vence,
        payment_methods: { installments: 1 }
    };
    if (base) {
        const regreso = `${base}/pedido.html?id=${encodeURIComponent(venta.id)}`;
        preferencia.back_urls = { success: regreso, pending: regreso, failure: regreso };
        preferencia.auto_return = 'approved';
        preferencia.notification_url = `${base}/api/tienda/webhook-mercadopago`;
    }

    const data = await llamarMP('POST', '/checkout/preferences', preferencia);
    return { preferenciaId: data.id, urlPago: data.init_point };
}

/** Busca el pago de una venta por su external_reference (el más reciente primero) */
async function buscarPagosDeVenta(ventaId) {
    const q = new URLSearchParams({ external_reference: ventaId, sort: 'date_created', criteria: 'desc' });
    const data = await llamarMP('GET', `/v1/payments/search?${q}`);
    return data.results || [];
}

async function obtenerPago(pagoId) {
    return llamarMP('GET', `/v1/payments/${encodeURIComponent(pagoId)}`);
}

module.exports = { pagoEnLineaActivo, crearPreferencia, buscarPagosDeVenta, obtenerPago };
