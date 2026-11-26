// =============================================================================
// CapitalHub - Envío de correos con Brevo (API HTTPS, no SMTP)
// Los hostings gratuitos (Render, Railway) bloquean los puertos SMTP, por eso se usa la API.
// Variables en .env:
//   BREVO_API_KEY=xkeysib-...           (Brevo > SMTP & API > API Keys)
//   CORREO_REMITENTE=correo@verificado  (remitente verificado en Brevo)
// Si faltan, no se envía nada y el sistema sigue funcionando igual.
// =============================================================================
require('dotenv').config();

const NOMBRE_REMITENTE = 'Capital Barbería';
const TELEFONO = '618-310-0009';
const DIRECCION = 'Prol. Pino Suárez 2910, Col. José Guadalupe Rodríguez, Durango, Dgo.';

const correoActivo = () => Boolean(process.env.BREVO_API_KEY && process.env.CORREO_REMITENTE);

const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const esCorreoInterno = (email) => !email || /@(clientes\.)?capitalhub\.local$/i.test(email) || email === 'mostrador@capitalhub.local';

/**
 * Envía un correo. Nunca lanza error: regresa true si Brevo lo aceptó.
 * Se usa "sin esperar" (fire-and-forget) para no hacer lenta la respuesta al cliente.
 */
async function enviarCorreo({ para, nombre, asunto, html }) {
    if (!correoActivo() || esCorreoInterno(para)) return false;
    try {
        const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'api-key': process.env.BREVO_API_KEY,
                'content-type': 'application/json',
                accept: 'application/json'
            },
            body: JSON.stringify({
                sender: { name: NOMBRE_REMITENTE, email: process.env.CORREO_REMITENTE },
                to: [{ email: para, name: nombre || para }],
                subject: asunto,
                htmlContent: html
            }),
            signal: AbortSignal.timeout(10000)
        });
        if (!resp.ok) {
            console.error('🔴 Brevo rechazó el correo:', resp.status, (await resp.text()).slice(0, 300));
            return false;
        }
        return true;
    } catch (error) {
        console.error('🔴 No se pudo enviar el correo:', error.message);
        return false;
    }
}

// -----------------------------------------------------------------------------
// Plantillas
// -----------------------------------------------------------------------------
const marco = (titulo, cuerpo) => `
<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f4f5;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
    <div style="background:#09090b;color:#ffffff;padding:18px 24px">
      <strong style="font-size:18px;letter-spacing:1px">CAPITAL</strong>
      <span style="font-size:11px;letter-spacing:3px;color:#a1a1aa;margin-left:6px">BARBERÍA</span>
    </div>
    <div style="padding:24px;color:#18181b;font-size:14px;line-height:1.6">
      <h2 style="margin:0 0 12px;font-size:18px">${esc(titulo)}</h2>
      ${cuerpo}
    </div>
    <div style="padding:16px 24px;background:#fafafa;color:#71717a;font-size:12px;line-height:1.5">
      ${esc(DIRECCION)} · Tel. ${esc(TELEFONO)}<br>
      Recibes este correo por tu cita o pedido en Capital Barbería. Consulta nuestro aviso de privacidad en el sitio web.
    </div>
  </div>
</div>`;

const fila = (etiqueta, valor) => `<tr><td style="padding:4px 12px 4px 0;color:#71717a">${esc(etiqueta)}</td><td style="padding:4px 0"><strong>${esc(valor)}</strong></td></tr>`;

const fechaLarga = (fecha) => new Date(`${fecha}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const hora12 = (h) => { const [a, b] = String(h).split(':').map(Number); return `${a % 12 || 12}:${String(b).padStart(2, '0')} ${a >= 12 ? 'PM' : 'AM'}`; };
const dinero = (n) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

/** cita: { servicio, barbero, fecha_cita, hora_inicio, precio }  tipo: 'confirmada' | 'cancelada' | 'reprogramada' */
function correoCita(tipo, cita, nombre) {
    const titulos = {
        confirmada: 'Tu cita está confirmada',
        cancelada: 'Tu cita fue cancelada',
        reprogramada: 'Tu cita fue reprogramada'
    };
    const intro = {
        confirmada: 'Te esperamos. Recuerda que hay 10 minutos de tolerancia.',
        cancelada: 'Cancelamos la siguiente cita. Si fue un error, puedes agendar otra en nuestro sitio.',
        reprogramada: 'Estos son los nuevos datos de tu cita.'
    };
    const tabla = `<table style="margin:12px 0">${fila('Servicio', cita.servicio)}${fila('Barbero', cita.barbero)}${fila('Fecha', fechaLarga(cita.fecha_cita))}${fila('Hora', hora12(cita.hora_inicio))}${cita.precio ? fila('Precio', dinero(cita.precio)) : ''}</table>`;
    const pie = tipo === 'cancelada' ? '' : `<p style="color:#52525b">Puedes cancelar o reprogramar hasta 5 horas antes. Con menos tiempo, llámanos al ${esc(TELEFONO)}.</p>`;
    return {
        asunto: `${titulos[tipo]} - Capital Barbería`,
        html: marco(titulos[tipo], `<p>Hola ${esc(nombre || '')},</p><p>${intro[tipo]}</p>${tabla}${pie}`)
    };
}

/** venta: { folio, items: [{nombre, cantidad, precio_unitario}], subtotal, costo_envio, total, tipo_entrega, metodo_pago } */
function correoPedido(venta, nombre) {
    const filas = venta.items.map(i => `<tr><td style="padding:4px 0">${esc(i.cantidad)} × ${esc(i.nombre)}</td><td style="padding:4px 0;text-align:right">${dinero(i.cantidad * i.precio_unitario)}</td></tr>`).join('');
    const entrega = venta.tipo_entrega === 'RECOGER_LOCAL'
        ? `Recoges en la barbería (${esc(DIRECCION)}).${venta.metodo_pago === 'EFECTIVO_LOCAL' ? ' Pagas en efectivo al recoger.' : ''}`
        : 'Te lo enviamos a la dirección que registraste dentro de Durango.';
    const titulo = venta.metodo_pago === 'PASARELA_ONLINE' ? `Recibimos tu pago - Pedido ${venta.folio}` : `Pedido ${venta.folio} recibido`;
    return {
        asunto: `${titulo} - Capital Barbería`,
        html: marco(titulo, `
            <p>Hola ${esc(nombre || '')}, gracias por tu compra.</p>
            <table style="width:100%;margin:12px 0;border-top:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7">${filas}
              ${Number(venta.costo_envio) > 0 ? `<tr><td style="padding:4px 0">Envío</td><td style="padding:4px 0;text-align:right">${dinero(venta.costo_envio)}</td></tr>` : ''}
              <tr><td style="padding:6px 0"><strong>Total</strong></td><td style="padding:6px 0;text-align:right"><strong>${dinero(venta.total)}</strong></td></tr>
            </table>
            <p>${entrega}</p>`)
    };
}

module.exports = { enviarCorreo, correoActivo, correoCita, correoPedido };
