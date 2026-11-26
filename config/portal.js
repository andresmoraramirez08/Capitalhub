// =============================================================================
// CapitalHub - Reglas del portal del cliente (SRS) y validaciones de datos
// Un solo lugar para cambiar las reglas si la barbería lo pide.
// =============================================================================

// Versión del aviso de privacidad publicado en frontend/aviso-privacidad.html.
// Si se cambia el texto del aviso, se cambia también esta fecha.
const AVISO_PRIVACIDAD_VERSION = '2026-11-26';

const HORAS_MIN_RESERVA = 24;      // RF-AG-02: reservar con al menos 24 h de anticipación
const HORAS_MIN_CANCELACION = 5;   // RF-AG-03: cancelar o reprogramar con al menos 5 h

// Tienda en línea
const COSTO_ENVIO_DURANGO = 80;   // PRUEBA: confirmar con la barbería el costo real del envío
const MINUTOS_PARA_PAGAR = 30;    // si el pago en línea no se completa, el pedido se cancela y el stock regresa
const MAX_PIEZAS_POR_PRODUCTO = 10;

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_HORA = /^\d{2}:\d{2}$/;
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Deja solo los 10 dígitos del celular (quita espacios, guiones y el +52). Regresa '' si no es válido. */
const limpiarTelefono = (valor) => {
    let digitos = String(valor || '').replace(/\D/g, '');
    if (digitos.length === 12 && digitos.startsWith('52')) digitos = digitos.slice(2);
    return digitos.length === 10 ? digitos : '';
};

const limpiarTexto = (valor, max = 100) => String(valor || '').trim().replace(/\s+/g, ' ').slice(0, max);

const emailValido = (valor) => REGEX_EMAIL.test(String(valor || '').trim()) && String(valor).trim().length <= 150;

/** Fecha y hora local (del servidor) dentro de N horas, como { fecha: 'YYYY-MM-DD', hora: 'HH:MM' } */
const fechaHoraDentroDe = (horas) => {
    const d = new Date(Date.now() + horas * 3600 * 1000);
    const dos = (n) => String(n).padStart(2, '0');
    return {
        fecha: `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`,
        hora: `${dos(d.getHours())}:${dos(d.getMinutes())}`
    };
};

/** true si la cita (fecha 'YYYY-MM-DD' + hora 'HH:MM') es al menos 24 h después de ahora */
const cumpleAnticipacion = (fecha, hora) => {
    const limite = fechaHoraDentroDe(HORAS_MIN_RESERVA);
    return `${fecha} ${String(hora).slice(0, 5)}` >= `${limite.fecha} ${limite.hora}`;
};

module.exports = {
    AVISO_PRIVACIDAD_VERSION,
    HORAS_MIN_RESERVA,
    HORAS_MIN_CANCELACION,
    COSTO_ENVIO_DURANGO,
    MINUTOS_PARA_PAGAR,
    MAX_PIEZAS_POR_PRODUCTO,
    REGEX_FECHA,
    REGEX_HORA,
    REGEX_UUID,
    limpiarTelefono,
    limpiarTexto,
    emailValido,
    fechaHoraDentroDe,
    cumpleAnticipacion
};
