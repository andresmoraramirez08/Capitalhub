// =============================================================================
// CapitalHub - Carrito y pago de la tienda (carrito.html)
// =============================================================================
const $ = (id) => document.getElementById(id);
let PRODUCTOS = new Map();
let CONFIG = { pago_en_linea: false, costo_envio: 0, minutos_para_pagar: 30 };

const entrega = () => document.querySelector('input[name="entrega"]:checked').value;
const metodoPago = () => document.querySelector('input[name="pago"]:checked').value;

async function iniciar() {
    const [rp, rc] = await Promise.all([apiPortal('GET', '/api/portal/productos'), apiPortal('GET', '/api/tienda/config')]);
    if (rp.ok) PRODUCTOS = new Map(rp.data.map(p => [Number(p.id), p]));
    if (rc.ok) CONFIG = rc.data;
    $('costo-envio-texto').textContent = `${dinero(CONFIG.costo_envio)} MXN`;

    // Quitamos del carrito lo que ya no existe o está agotado
    const antes = leerCarrito();
    const validos = antes.filter(i => PRODUCTOS.has(Number(i.producto_id)) && PRODUCTOS.get(Number(i.producto_id)).disponible);
    if (validos.length !== antes.length) {
        guardarCarrito(validos);
        mostrarToast('Quitamos del carrito productos que ya no están disponibles.', 'aviso');
    }

    const s = sesionCliente();
    $('datos-cuenta').classList.toggle('hidden', !s);
    $('form-comprador').classList.toggle('hidden', !!s);
    if (s) $('nombre-cuenta').textContent = s.nombre;

    pintar();
}

function pintar() {
    const items = leerCarrito();
    $('carrito-vacio').classList.toggle('hidden', items.length > 0);
    $('carrito-lleno').classList.toggle('hidden', items.length === 0);
    if (!items.length) return;

    $('lista-carrito').innerHTML = items.map(i => {
        const p = PRODUCTOS.get(Number(i.producto_id));
        return `
        <div class="py-3 flex items-center gap-3">
            <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-white truncate">${escaparHTML(p.nombre)}</p>
                <p class="text-xs text-brand-muted">${dinero(p.precio)} c/u</p>
            </div>
            <div class="flex items-center border border-brand-border rounded-lg" role="group" aria-label="Cantidad de ${escaparHTML(p.nombre)}">
                <button type="button" data-menos="${p.id}" class="w-9 h-9 text-lg text-neutral-300 hover:text-white" aria-label="Quitar uno">−</button>
                <span class="w-8 text-center text-sm font-bold">${Number(i.cantidad)}</span>
                <button type="button" data-mas="${p.id}" class="w-9 h-9 text-lg text-neutral-300 hover:text-white" aria-label="Agregar uno">+</button>
            </div>
            <p class="w-20 text-right text-sm font-bold text-white">${dinero(p.precio * i.cantidad)}</p>
            <button type="button" data-quitar="${p.id}" class="text-neutral-500 hover:text-red-300 text-xl leading-none" aria-label="Quitar ${escaparHTML(p.nombre)}">×</button>
        </div>`;
    }).join('');

    // Reglas de entrega y pago
    const envio = entrega() === 'ENVIO_LOCAL_ESTATAL';
    $('campos-envio').classList.toggle('hidden', !envio);
    const radioEfectivo = document.querySelector('input[value="EFECTIVO_LOCAL"]');
    const radioMP = document.querySelector('input[value="PASARELA_ONLINE"]');
    radioMP.disabled = !CONFIG.pago_en_linea;
    radioEfectivo.disabled = envio;
    if (envio && CONFIG.pago_en_linea) radioMP.checked = true;
    if (!CONFIG.pago_en_linea) radioEfectivo.checked = true;
    $('opcion-efectivo').classList.toggle('opacity-40', envio);
    $('opcion-mp').classList.toggle('opacity-40', !CONFIG.pago_en_linea);
    $('aviso-sin-mp').classList.toggle('hidden', CONFIG.pago_en_linea);
    const envioDeshabilitado = !CONFIG.pago_en_linea;
    const radioEnvio = document.querySelector('input[value="ENVIO_LOCAL_ESTATAL"]');
    radioEnvio.disabled = envioDeshabilitado;
    if (envioDeshabilitado && envio) document.querySelector('input[value="RECOGER_LOCAL"]').checked = true;

    document.querySelectorAll('[data-opcion]').forEach(l => {
        const r = l.querySelector('input');
        l.classList.toggle('border-brand-gold', r.checked);
        l.classList.toggle('cursor-not-allowed', r.disabled);
    });

    // Totales
    const subtotal = items.reduce((s, i) => s + PRODUCTOS.get(Number(i.producto_id)).precio * i.cantidad, 0);
    const costoEnvio = entrega() === 'ENVIO_LOCAL_ESTATAL' ? Number(CONFIG.costo_envio) : 0;
    $('r-subtotal').textContent = dinero(subtotal);
    $('r-envio').textContent = costoEnvio ? dinero(costoEnvio) : 'Gratis';
    $('r-total').textContent = `${dinero(subtotal + costoEnvio)} MXN`;
    const enLinea = metodoPago() === 'PASARELA_ONLINE';
    $('btn-confirmar').textContent = enLinea ? 'Pagar con Mercado Pago' : 'Confirmar pedido';
    $('nota-pago').textContent = enLinea
        ? `Te llevaremos a Mercado Pago. Tienes ${CONFIG.minutos_para_pagar} minutos para pagar; si no, el pedido se cancela.`
        : 'Apartamos tus productos. Pagas en efectivo al recogerlos en la barbería.';
}

function validar() {
    const cuerpo = {
        items: leerCarrito().map(i => ({ producto_id: Number(i.producto_id), cantidad: Number(i.cantidad) })),
        tipo_entrega: entrega(),
        metodo_pago: metodoPago()
    };
    if (cuerpo.tipo_entrega === 'ENVIO_LOCAL_ESTATAL') {
        Object.assign(cuerpo, {
            direccion_calle: $('env-calle').value.trim(),
            colonia: $('env-colonia').value.trim(),
            codigo_postal: $('env-cp').value.trim(),
            municipio: $('env-municipio').value.trim(),
            referencias: $('env-referencias').value.trim()
        });
        if (!cuerpo.direccion_calle || !cuerpo.colonia || !cuerpo.municipio) return { error: 'Escribe la calle y número, la colonia y el municipio.', campo: 'env-calle' };
        if (!/^34\d{3}$/.test(cuerpo.codigo_postal)) return { error: 'El código postal debe ser de Durango (34xxx).', campo: 'env-cp' };
    }
    if (!sesionCliente()) {
        Object.assign(cuerpo, {
            nombre: $('c-nombre').value.trim(),
            apellidos: $('c-apellidos').value.trim(),
            telefono: $('c-telefono').value.trim(),
            email: $('c-email').value.trim().toLowerCase(),
            acepta_aviso: $('c-aviso').checked,
            sitio_web: $('c-sitio').value
        });
        const dig = cuerpo.telefono.replace(/\D/g, '');
        if (cuerpo.nombre.length < 2 || cuerpo.apellidos.length < 2) return { error: 'Escribe tu nombre y tus apellidos.', campo: 'c-nombre' };
        if (!(dig.length === 10 || (dig.length === 12 && dig.startsWith('52')))) return { error: 'El teléfono debe tener 10 dígitos.', campo: 'c-telefono' };
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cuerpo.email)) return { error: 'Escribe un correo válido.', campo: 'c-email' };
        if (!cuerpo.acepta_aviso) return { error: 'Debes aceptar el aviso de privacidad para comprar.', campo: 'c-aviso' };
    }
    return { cuerpo };
}

async function confirmar() {
    const v = validar();
    if (v.error) { mostrarToast(v.error, 'error'); const c = $(v.campo); if (c) c.focus(); return; }
    const btn = $('btn-confirmar');
    botonCargando(btn, true, 'Procesando...');
    const r = await apiPortal('POST', '/api/tienda/pedidos', v.cuerpo, { conSesion: !!sesionCliente() });
    if (!r.ok) {
        botonCargando(btn, false);
        if (r.status === 401) { mostrarToast('Tu sesión expiró. Vuelve a iniciar sesión o compra como invitado.', 'aviso'); return iniciar(); }
        if (r.status === 409 && r.data && r.data.producto_id) {
            cambiarCantidadCarrito(r.data.producto_id, r.data.disponible);
            pintar();
        }
        return mostrarToast(mensajeDe(r, 'No se pudo crear el pedido.'), 'error');
    }
    vaciarCarrito();
    if (r.data.url_pago) {
        mostrarToast('Te llevamos a Mercado Pago…');
        setTimeout(() => { location.href = r.data.url_pago; }, 600);
    } else {
        location.href = `pedido.html?id=${encodeURIComponent(r.data.venta_id)}&nuevo=1`;
    }
}

document.addEventListener('click', (e) => {
    const mas = e.target.closest('[data-mas]');
    const menos = e.target.closest('[data-menos]');
    const quitar = e.target.closest('[data-quitar]');
    const cant = (id) => Number((leerCarrito().find(i => Number(i.producto_id) === Number(id)) || {}).cantidad || 0);
    if (mas) { agregarAlCarrito(Number(mas.dataset.mas)); pintar(); }
    if (menos) { cambiarCantidadCarrito(menos.dataset.menos, cant(menos.dataset.menos) - 1); pintar(); }
    if (quitar) { cambiarCantidadCarrito(quitar.dataset.quitar, 0); pintar(); }
});
document.addEventListener('change', (e) => { if (e.target.name === 'entrega' || e.target.name === 'pago') pintar(); });
$('btn-confirmar').addEventListener('click', confirmar);

iniciar();
