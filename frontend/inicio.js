// =============================================================================
// CapitalHub - Página pública (index.html): catálogos y asistente de reserva en 4 pasos
// =============================================================================

const reserva = { paso: 1, servicio: null, barbero: null, fecha: null, hora: null, modoDatos: 'invitado' };
let SERVICIOS = [];
let BARBEROS = [];
const LETRAS_DIA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const CLAVE_RESERVA = 'ch_reserva_pendiente';

const $ = (id) => document.getElementById(id);

// -----------------------------------------------------------------------------
// Carga de catálogos
// -----------------------------------------------------------------------------
async function cargarCatalogos() {
    const [rs, rb] = await Promise.all([apiPortal('GET', '/api/portal/servicios'), apiPortal('GET', '/api/portal/barberos')]);
    if (rs.ok) SERVICIOS = rs.data; else $('lista-servicios').innerHTML = `<p class="text-sm text-red-300 col-span-full text-center">${escaparHTML(mensajeDe(rs))}</p>`;
    if (rb.ok) BARBEROS = rb.data; else $('lista-barberos').innerHTML = `<p class="text-sm text-red-300 col-span-full text-center">${escaparHTML(mensajeDe(rb))}</p>`;

    if (rs.ok) { pintarServicios(); pintarDestacado(); }
    if (rb.ok) { pintarEquipo(); $('stat-barberos').textContent = BARBEROS.length; }
    pintarOpcionesServicio();
    restaurarReservaPendiente();
    actualizarAsistente();
    cargarProductos();
}

function servicioDestacado() {
    return SERVICIOS.find(s => /facial/i.test(s.nombre) && s.nombre.includes('+')) || SERVICIOS.find(esCombo) || SERVICIOS[0];
}

function pintarDestacado() {
    const s = servicioDestacado();
    if (!s) return;
    $('destacado-nombre').textContent = s.nombre;
    $('destacado-precio').textContent = `${dinero(s.precio)} MXN`;
    $('destacado-duracion').textContent = `⏱️ ${s.duracion_minutos} minutos`;
    $('btn-destacado').onclick = () => { elegirServicio(s.id); irAAgendar(); };
}

function pintarServicios() {
    const destacado = servicioDestacado();
    $('lista-servicios').innerHTML = SERVICIOS.map(s => {
        const esDestacado = destacado && s.id === destacado.id;
        return `
        <div class="${esDestacado ? 'border-2 border-brand-gold shadow-lg shadow-brand-gold/10 relative' : 'border border-brand-border hover:border-brand-gold/50'} bg-brand-card rounded-xl p-6 transition flex flex-col">
            ${esDestacado ? '<div class="absolute -top-3 right-4 bg-brand-gold text-black text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full tracking-wider">Recomendado</div>' : ''}
            <div class="flex justify-between items-start gap-3 mb-2">
                <h3 class="font-bold text-white text-lg">${escaparHTML(s.nombre)}</h3>
                <span class="text-brand-gold font-bold text-lg whitespace-nowrap">${dinero(s.precio)}</span>
            </div>
            <p class="text-xs text-brand-muted mb-4 flex-1">${escaparHTML(s.descripcion || '')}</p>
            <div class="flex items-center justify-between text-xs pt-4 border-t border-brand-border text-neutral-400">
                <span>⏱️ ${Number(s.duracion_minutos)} minutos</span>
                <button type="button" data-agendar-servicio="${s.id}" class="text-brand-gold font-semibold hover:underline">${esCombo(s) ? 'Combo' : 'Individual'} · Agendar →</button>
            </div>
        </div>`;
    }).join('') || '<p class="text-sm text-brand-muted col-span-full text-center">Pronto publicaremos nuestros servicios.</p>';
}

function chipsDias(dias) {
    const trabaja = new Set((dias || []).map(Number));
    return LETRAS_DIA.map((l, i) => `<span class="w-6 h-6 rounded-md text-[10px] font-bold flex items-center justify-center ${trabaja.has(i) ? 'bg-brand-cardElevated text-white' : 'text-neutral-600 line-through'}">${l}</span>`).join('');
}

function pintarEquipo() {
    $('lista-barberos').innerHTML = BARBEROS.map(b => `
        <div class="bg-brand-card border border-brand-border rounded-xl p-6 flex flex-col">
            <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-full bg-brand-cardElevated border border-brand-border flex items-center justify-center text-lg font-bold text-white">${escaparHTML((b.nombre || '?').trim().charAt(0).toUpperCase())}</div>
                <div>
                    <h3 class="font-bold text-white">${escaparHTML(b.nombre)}</h3>
                    <p class="text-xs text-brand-muted">${escaparHTML(b.especialidad || 'Barbero')}</p>
                </div>
            </div>
            <div class="flex gap-1 mt-4" aria-label="Días que trabaja">${chipsDias(b.dias_laborales)}</div>
            <button type="button" data-agendar-barbero="${escaparHTML(b.id)}" class="mt-5 text-center bg-brand-cardElevated hover:bg-neutral-700 border border-brand-border text-white font-semibold py-2 rounded-lg text-xs transition">Agendar con ${escaparHTML(b.nombre.split(' ')[0])}</button>
        </div>`).join('') || '<p class="text-sm text-brand-muted col-span-full text-center">Por ahora no hay barberos con agenda en línea. Llámanos al 618-310-0009.</p>';
}

// Cloudinary entrega la foto al tamaño pedido y en el formato más ligero para el navegador
const urlFoto = (url, ancho) => (url && url.includes('res.cloudinary.com'))
    ? url.replace('/upload/', `/upload/f_auto,q_auto,c_limit,w_${ancho}/`) : url;

const EMOJI_CATEGORIA = [[/cera|pomada/i, '💈'], [/peine|accesorio/i, '🪮'], [/shampoo/i, '🧴'], [/barba|minoxidil/i, '🧔'], [/tinte|pigment/i, '✨']];

async function cargarProductos() {
    const r = await apiPortal('GET', '/api/portal/productos');
    const cont = $('lista-productos');
    if (!r.ok) { cont.innerHTML = `<p class="text-sm text-brand-muted col-span-full text-center">${escaparHTML(mensajeDe(r))}</p>`; return; }
    cont.innerHTML = r.data.map(p => {
        const emoji = (EMOJI_CATEGORIA.find(([re]) => re.test(p.categoria || '')) || [null, '🛍️'])[1];
        return `
        <div class="bg-brand-card border border-brand-border rounded-xl p-3 sm:p-4 flex flex-col justify-between">
            <div>
                ${p.imagen_url
                    ? `<img src="${escaparHTML(urlFoto(p.imagen_url, 500))}" alt="${escaparHTML(p.nombre)}" loading="lazy" class="w-full h-24 sm:h-36 object-cover bg-black rounded-lg mb-3 border border-brand-border">`
                    : `<div class="h-24 sm:h-36 bg-black rounded-lg mb-3 flex items-center justify-center text-3xl sm:text-4xl border border-brand-border">${emoji}</div>`}
                <span class="text-[10px] uppercase font-bold text-brand-gold">${escaparHTML(p.categoria || 'General')}</span>
                <h4 class="text-sm font-bold text-white mt-1">${escaparHTML(p.nombre)}</h4>
                ${p.descripcion ? `<p class="text-xs text-brand-muted mt-1 hidden sm:block">${escaparHTML(p.descripcion)}</p>` : ''}
            </div>
            <div class="mt-4 pt-3 border-t border-brand-border flex flex-wrap items-center justify-between gap-2">
                <span class="text-white font-bold text-sm">${dinero(p.precio)} MXN</span>
                ${p.disponible
                    ? `<button type="button" data-agregar-producto="${Number(p.id)}" class="bg-brand-gold/10 hover:bg-brand-gold text-brand-gold hover:text-black font-bold px-3 py-1.5 rounded-lg text-xs transition border border-brand-gold/30">Agregar</button>`
                    : '<span class="text-[10px] font-semibold text-neutral-400 bg-zinc-500/10 border border-zinc-600 px-2 py-0.5 rounded-full">Agotado</span>'}
            </div>
        </div>`;
    }).join('') || '<p class="text-sm text-brand-muted col-span-full text-center">Pronto publicaremos nuestros productos.</p>';
}

// -----------------------------------------------------------------------------
// Asistente: pasos
// -----------------------------------------------------------------------------
function irAAgendar() {
    $('agendar').scrollIntoView({ behavior: 'smooth' });
}

function pasoCompleto(n) {
    if (n === 1) return !!reserva.servicio;
    if (n === 2) return !!reserva.barbero;
    if (n === 3) return !!(reserva.fecha && reserva.hora);
    return true;
}

function pasoMaximoPermitido() {
    let p = 1;
    while (p < 4 && pasoCompleto(p)) p++;
    return p;
}

function irPaso(n) {
    reserva.paso = Math.min(n, pasoMaximoPermitido());
    actualizarAsistente();
    if (reserva.paso === 2) pintarOpcionesBarbero();
    if (reserva.paso === 3) pintarDias();
    if (reserva.paso === 4) pintarPasoDatos();
}

function actualizarAsistente() {
    document.querySelectorAll('[data-paso]').forEach(el => el.classList.toggle('hidden', el.dataset.paso !== String(reserva.paso)));
    const exito = reserva.paso === 'exito';
    $('nav-pasos').classList.toggle('hidden', exito);
    $('indicador-pasos').classList.toggle('hidden', exito);

    document.querySelectorAll('[data-ir-paso]').forEach(b => {
        const n = Number(b.dataset.irPaso);
        const activo = n === reserva.paso;
        const alcanzable = n <= pasoMaximoPermitido();
        b.className = `w-full pb-2 border-b-2 transition ${activo ? 'border-brand-gold text-brand-gold' : alcanzable ? 'border-neutral-600 text-neutral-300 hover:text-white' : 'border-brand-border text-neutral-600 cursor-default'}`;
        b.disabled = !alcanzable;
        if (activo) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });

    $('btn-atras').classList.toggle('invisible', reserva.paso === 1 || exito);
    const sig = $('btn-siguiente');
    if (reserva.paso === 4) {
        sig.textContent = 'Confirmar cita';
        sig.disabled = false;
    } else {
        sig.textContent = 'Continuar →';
        sig.disabled = !pasoCompleto(reserva.paso);
    }
    pintarResumen();
}

function pintarResumen() {
    const partes = [];
    const s = SERVICIOS.find(x => x.id === reserva.servicio);
    const b = BARBEROS.find(x => x.id === reserva.barbero);
    if (s) partes.push(`<span>✂️ <strong class="text-white">${escaparHTML(s.nombre)}</strong> · ${dinero(s.precio)} · ${Number(s.duracion_minutos)} min</span>`);
    if (b) partes.push(`<span>👤 <strong class="text-white">${escaparHTML(b.nombre)}</strong></span>`);
    if (reserva.fecha) partes.push(`<span>📅 <strong class="text-white">${escaparHTML(capitalizar(fechaLarga(reserva.fecha)))}</strong>${reserva.hora ? ` · ${hora12(reserva.hora)}` : ''}</span>`);
    const caja = $('resumen-reserva');
    caja.innerHTML = partes.join('');
    caja.classList.toggle('hidden', partes.length === 0 || reserva.paso === 'exito');
}

// Paso 1
function pintarOpcionesServicio() {
    $('opciones-servicio').innerHTML = SERVICIOS.map(s => `
        <label class="flex items-center justify-between gap-3 p-4 rounded-xl border border-brand-border bg-brand-dark hover:border-neutral-600 cursor-pointer ${reserva.servicio === s.id ? 'opcion-sel' : ''}">
            <span class="flex items-center gap-3">
                <input type="radio" name="servicio" value="${s.id}" ${reserva.servicio === s.id ? 'checked' : ''} class="accent-neutral-300">
                <span>
                    <span class="block text-sm font-bold text-white">${escaparHTML(s.nombre)}</span>
                    <span class="block text-xs text-brand-muted">${Number(s.duracion_minutos)} min${esCombo(s) ? ' · Combo' : ''}</span>
                </span>
            </span>
            <span class="text-brand-gold font-bold text-sm whitespace-nowrap">${dinero(s.precio)}</span>
        </label>`).join('') || '<p class="text-sm text-brand-muted">No hay servicios disponibles.</p>';
}

function elegirServicio(id) {
    if (reserva.servicio !== id) { reserva.hora = null; }
    reserva.servicio = id;
    pintarOpcionesServicio();
    actualizarAsistente();
}

// Paso 2
function pintarOpcionesBarbero() {
    $('opciones-barbero').innerHTML = BARBEROS.map(b => `
        <label class="flex items-center justify-between gap-3 p-4 rounded-xl border border-brand-border bg-brand-dark hover:border-neutral-600 cursor-pointer ${reserva.barbero === b.id ? 'opcion-sel' : ''}">
            <span class="flex items-center gap-3">
                <input type="radio" name="barbero" value="${escaparHTML(b.id)}" ${reserva.barbero === b.id ? 'checked' : ''} class="accent-neutral-300">
                <span>
                    <span class="block text-sm font-bold text-white">${escaparHTML(b.nombre)}</span>
                    <span class="block text-xs text-brand-muted">${escaparHTML(b.especialidad || 'Barbero')}</span>
                </span>
            </span>
            <span class="flex gap-0.5">${chipsDias(b.dias_laborales)}</span>
        </label>`).join('') || '<p class="text-sm text-brand-muted">No hay barberos con agenda en línea. Llámanos al 618-310-0009.</p>';
}

function elegirBarbero(id) {
    if (reserva.barbero !== id) { reserva.fecha = null; reserva.hora = null; }
    reserva.barbero = id;
    pintarOpcionesBarbero();
    actualizarAsistente();
}

// Paso 3
function pintarDias() {
    const b = BARBEROS.find(x => x.id === reserva.barbero);
    const trabaja = new Set(((b && b.dias_laborales) || []).map(Number));
    $('opciones-dia').innerHTML = diasReservables(21).map(d => {
        const libre = trabaja.has(d.dow);
        const sel = reserva.fecha === d.fecha;
        return `<button type="button" data-fecha="${d.fecha}" ${libre ? '' : 'disabled'}
                    class="shrink-0 w-16 py-2 rounded-xl border text-center transition ${sel ? 'opcion-sel border-brand-gold text-white' : libre ? 'border-brand-border bg-brand-dark text-neutral-200 hover:border-neutral-500' : 'border-brand-border/50 text-neutral-600 cursor-not-allowed'}">
                    <span class="block text-[10px] uppercase">${escaparHTML(d.nombreDia)}</span>
                    <span class="block text-lg font-bold leading-tight">${d.dia}</span>
                    <span class="block text-[10px] uppercase">${escaparHTML(d.mes)}</span>
                </button>`;
    }).join('');
    const diaSel = document.querySelector('#opciones-dia .opcion-sel');
    if (diaSel) diaSel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (reserva.fecha) cargarHoras(); else { $('opciones-hora').innerHTML = ''; $('titulo-horas').textContent = 'Elige un día para ver los horarios.'; }
}

let consultaHoras = 0;
async function cargarHoras() {
    const id = ++consultaHoras;
    $('titulo-horas').textContent = 'Buscando horarios…';
    $('opciones-hora').innerHTML = '';
    const r = await apiPortal('POST', '/api/portal/horarios-disponibles',
        { fecha: reserva.fecha, barbero_id: reserva.barbero, servicio_id: reserva.servicio });
    if (id !== consultaHoras) return; // llegó otra consulta más reciente
    if (!r.ok) { $('titulo-horas').textContent = mensajeDe(r, 'No se pudieron cargar los horarios.'); return; }
    const horas = r.data.horariosDisponibles || [];
    if (reserva.hora && !horas.some(h => h.hora24 === reserva.hora)) reserva.hora = null;
    $('titulo-horas').textContent = horas.length ? `Horarios para el ${fechaLarga(reserva.fecha)}:` : (r.data.mensaje || 'No hay horarios libres ese día. Prueba otro.');
    $('opciones-hora').innerHTML = horas.map(h => `
        <button type="button" data-hora="${h.hora24}" class="py-2.5 rounded-lg border text-sm font-semibold transition ${reserva.hora === h.hora24 ? 'opcion-sel border-brand-gold text-white' : 'border-brand-border bg-brand-dark text-neutral-200 hover:border-neutral-500'}">${escaparHTML(h.hora12)}</button>`).join('');
    actualizarAsistente();
}

// Paso 4
function pintarPasoDatos() {
    const s = sesionCliente();
    $('datos-con-cuenta').classList.toggle('hidden', !s);
    $('datos-sin-cuenta').classList.toggle('hidden', !!s);
    if (s) $('nombre-cuenta').textContent = s.nombre;
    const invitado = reserva.modoDatos === 'invitado';
    $('form-invitado').classList.toggle('hidden', !invitado);
    $('form-login-reserva').classList.toggle('hidden', invitado);
    $('tab-invitado').className = `py-2 text-xs font-bold rounded-lg ${invitado ? 'bg-brand-cardElevated text-brand-gold border border-brand-border' : 'text-neutral-400 hover:text-white'}`;
    $('tab-cuenta').className = `py-2 text-xs font-bold rounded-lg ${!invitado ? 'bg-brand-cardElevated text-brand-gold border border-brand-border' : 'text-neutral-400 hover:text-white'}`;
    $('tab-invitado').setAttribute('aria-selected', String(invitado));
    $('tab-cuenta').setAttribute('aria-selected', String(!invitado));
    // En "Tengo una cuenta" el botón principal se oculta hasta iniciar sesión
    $('btn-siguiente').classList.toggle('hidden', !s && !invitado);
}

function datosInvitado() {
    const datos = {
        nombre: $('inv-nombre').value.trim(),
        apellidos: $('inv-apellidos').value.trim(),
        telefono: $('inv-telefono').value.trim(),
        email: $('inv-email').value.trim().toLowerCase(),
        acepta_aviso: $('inv-aviso').checked,
        sitio_web: $('inv-sitio').value
    };
    const digitos = datos.telefono.replace(/\D/g, '');
    if (datos.nombre.length < 2 || datos.apellidos.length < 2) return { error: 'Escribe tu nombre y tus apellidos.', campo: 'inv-nombre' };
    if (!(digitos.length === 10 || (digitos.length === 12 && digitos.startsWith('52')))) return { error: 'El teléfono debe tener 10 dígitos.', campo: 'inv-telefono' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(datos.email)) return { error: 'Escribe un correo válido.', campo: 'inv-email' };
    if (!datos.acepta_aviso) return { error: 'Debes aceptar el aviso de privacidad para agendar.', campo: 'inv-aviso' };
    return { datos };
}

async function confirmarCita() {
    const btn = $('btn-siguiente');
    const cuerpo = { servicio_id: reserva.servicio, barbero_id: reserva.barbero, fecha_cita: reserva.fecha, hora_inicio: reserva.hora };
    const conCuenta = !!sesionCliente();
    if (!conCuenta) {
        const v = datosInvitado();
        if (v.error) { mostrarToast(v.error, 'error'); const c = $(v.campo); if (c) c.focus(); return; }
        Object.assign(cuerpo, v.datos);
    }

    botonCargando(btn, true, 'Agendando...');
    const r = await apiPortal('POST', '/api/portal/citas', cuerpo, { conSesion: conCuenta });
    botonCargando(btn, false);

    if (r.ok) {
        mostrarExito(r.data.cita, conCuenta);
        return;
    }
    if (r.status === 401) {
        mostrarToast('Tu sesión expiró. Inicia sesión otra vez o agenda como invitado.', 'aviso');
        pintarZonaSesion();
        pintarPasoDatos();
        return;
    }
    mostrarToast(mensajeDe(r, 'No se pudo agendar la cita.'), 'error');
    if (r.status === 409 || r.status === 400 && /horario|hora|fecha|anticipación|trabaja/i.test(mensajeDe(r))) {
        // Alguien más ganó el horario o ya no cumple la regla: volvemos a elegir hora
        reserva.hora = null;
        irPaso(3);
    }
}

function mostrarExito(cita, conCuenta) {
    try { sessionStorage.removeItem(CLAVE_RESERVA); } catch (e) { }
    $('detalle-exito').innerHTML = cita ? `
        <p>✂️ <strong class="text-white">${escaparHTML(cita.servicio)}</strong> · ${dinero(cita.precio)}</p>
        <p>👤 ${escaparHTML(cita.barbero)}</p>
        <p>📅 ${escaparHTML(fechaLarga(cita.fecha_cita, true))}</p>
        <p>🕒 ${hora12(cita.hora_inicio)} a ${hora12(cita.hora_fin)}</p>` : '';
    $('btn-ir-mis-citas').classList.toggle('hidden', !conCuenta);
    reserva.paso = 'exito';
    actualizarAsistente();
    irAAgendar();
}

function reiniciarReserva() {
    Object.assign(reserva, { paso: 1, servicio: null, barbero: null, fecha: null, hora: null });
    ['inv-nombre', 'inv-apellidos', 'inv-telefono', 'inv-email'].forEach(id => { $(id).value = ''; });
    $('inv-aviso').checked = false;
    pintarOpcionesServicio();
    actualizarAsistente();
}

// Si el cliente se fue a crear su cuenta a mitad de la reserva, la retomamos al volver
function guardarReservaPendiente() {
    try {
        sessionStorage.setItem(CLAVE_RESERVA, JSON.stringify({
            servicio: reserva.servicio, barbero: reserva.barbero, fecha: reserva.fecha, hora: reserva.hora
        }));
    } catch (e) { }
}

function restaurarReservaPendiente() {
    let guardada = null;
    try { guardada = JSON.parse(sessionStorage.getItem(CLAVE_RESERVA) || 'null'); } catch (e) { }
    const desdeUrl = new URLSearchParams(location.search);
    if (desdeUrl.get('barbero')) reserva.barbero = desdeUrl.get('barbero');
    if (!guardada) return;
    if (SERVICIOS.some(s => s.id === guardada.servicio)) reserva.servicio = guardada.servicio;
    if (BARBEROS.some(b => b.id === guardada.barbero)) reserva.barbero = guardada.barbero;
    reserva.fecha = guardada.fecha || null;
    reserva.hora = guardada.hora || null;
    try { sessionStorage.removeItem(CLAVE_RESERVA); } catch (e) { }
    pintarOpcionesServicio();
    setTimeout(() => { irPaso(4); irAAgendar(); }, 50);
}

// -----------------------------------------------------------------------------
// Eventos
// -----------------------------------------------------------------------------
document.addEventListener('change', (e) => {
    if (e.target.name === 'servicio') elegirServicio(Number(e.target.value));
    if (e.target.name === 'barbero') elegirBarbero(e.target.value);
});

document.addEventListener('click', (e) => {
    const bProd = e.target.closest('[data-agregar-producto]');
    if (bProd) {
        if (agregarAlCarrito(Number(bProd.dataset.agregarProducto))) {
            mostrarToast('Agregado al carrito. Toca el carrito para terminar tu compra.');
        }
        return;
    }

    const bServ = e.target.closest('[data-agendar-servicio]');
    if (bServ) { elegirServicio(Number(bServ.dataset.agendarServicio)); irPaso(2); irAAgendar(); return; }

    const bBarb = e.target.closest('[data-agendar-barbero]');
    if (bBarb) {
        elegirBarbero(bBarb.dataset.agendarBarbero);
        irPaso(reserva.servicio ? 3 : 1);
        if (!reserva.servicio) mostrarToast('Primero elige el servicio.', 'aviso');
        irAAgendar();
        return;
    }

    const bPaso = e.target.closest('[data-ir-paso]');
    if (bPaso && !bPaso.disabled) { irPaso(Number(bPaso.dataset.irPaso)); return; }

    const bDia = e.target.closest('[data-fecha]');
    if (bDia && !bDia.disabled) {
        reserva.fecha = bDia.dataset.fecha;
        reserva.hora = null;
        pintarDias();
        actualizarAsistente();
        return;
    }

    const bHora = e.target.closest('[data-hora]');
    if (bHora) {
        reserva.hora = bHora.dataset.hora;
        document.querySelectorAll('[data-hora]').forEach(x => {
            const sel = x === bHora;
            x.classList.toggle('opcion-sel', sel);
            x.classList.toggle('border-brand-gold', sel);
        });
        actualizarAsistente();
    }
});

$('btn-siguiente').addEventListener('click', () => {
    if (reserva.paso === 4) return confirmarCita();
    if (pasoCompleto(reserva.paso)) irPaso(reserva.paso + 1);
});
$('btn-atras').addEventListener('click', () => irPaso(Math.max(1, reserva.paso - 1)));
$('btn-otra-cita').addEventListener('click', reiniciarReserva);

$('tab-invitado').addEventListener('click', () => { reserva.modoDatos = 'invitado'; pintarPasoDatos(); });
$('tab-cuenta').addEventListener('click', () => { reserva.modoDatos = 'cuenta'; pintarPasoDatos(); });
['link-crear-cuenta', 'link-crear-cuenta-2'].forEach(id => $(id).addEventListener('click', guardarReservaPendiente));

$('btn-cambiar-cuenta').addEventListener('click', () => {
    try { localStorage.clear(); } catch (e) { }
    pintarZonaSesion();
    reserva.modoDatos = 'invitado';
    pintarPasoDatos();
});

$('form-login-reserva').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('log-email').value.trim().toLowerCase();
    const password = $('log-password').value;
    if (!email || !password) return mostrarToast('Escribe tu correo y contraseña.', 'error');
    const btn = $('btn-login-reserva');
    botonCargando(btn, true, 'Entrando...');
    const r = await apiPortal('POST', '/api/auth/login', { email, password });
    botonCargando(btn, false);
    if (!r.ok) return mostrarToast(mensajeDe(r, 'Credenciales inválidas'), 'error');
    if (String(r.data.rol) !== '3') {
        return mostrarToast('Esa cuenta es del panel de la barbería. Agenda desde la agenda del panel.', 'aviso');
    }
    guardarSesion(r.data);
    $('log-password').value = '';
    pintarZonaSesion();
    pintarPasoDatos();
    mostrarToast(`¡Hola, ${r.data.nombre}! Ya puedes confirmar tu cita.`);
});

cargarCatalogos();
