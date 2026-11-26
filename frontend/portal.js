// =============================================================================
// CapitalHub - Utilidades del portal del cliente (páginas públicas)
// Se carga en index.html, cuenta.html, mis-citas.html y aviso-privacidad.html.
// No usa app.js porque ese archivo es del panel y manda al login a quien no tiene sesión.
// =============================================================================

const PORTAL = {
    telefono: '618-310-0009',
    direccion: 'Prol. Pino Suárez 2910, Col. José Guadalupe Rodríguez, Durango, Dgo.',
    horasReserva: 24,
    horasCancelacion: 5
};

// -----------------------------------------------------------------------------
// Sesión (mismas claves que usa el login del panel)
// -----------------------------------------------------------------------------
function leerSesion() {
    try {
        const token = localStorage.getItem('token');
        if (!token) return null;
        return {
            token,
            rol: localStorage.getItem('rol'),
            nombre: localStorage.getItem('nombre') || ''
        };
    } catch (e) {
        return null;
    }
}

/** Sesión de cliente (rol 3). Las sesiones del panel no se usan en el portal. */
function sesionCliente() {
    const s = leerSesion();
    return s && s.rol === '3' ? s : null;
}

function guardarSesion(data) {
    try {
        localStorage.clear();
        localStorage.setItem('token', data.token);
        localStorage.setItem('nombre', data.nombre || '');
        localStorage.setItem('usuario_id', data.id || '');
        localStorage.setItem('rol', String(data.rol));
        if (data.barbero_id) localStorage.setItem('barbero_id', data.barbero_id);
    } catch (e) { /* almacenamiento bloqueado: la sesión dura solo esta página */ }
}

function cerrarSesionPortal(destino = 'index.html') {
    try { localStorage.clear(); } catch (e) { }
    window.location.href = destino;
}

/** A dónde va cada rol después de iniciar sesión */
function destinoPorRol(rol) {
    return String(rol) === '3' ? 'mis-citas.html' : 'dashboard.html';
}

// -----------------------------------------------------------------------------
// Llamadas a la API. conSesion: manda el token del cliente si existe.
// Regresa { ok, status, data }.
// -----------------------------------------------------------------------------
async function apiPortal(metodo, url, cuerpo = null, { conSesion = false } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const s = sesionCliente();
    if (conSesion && s) headers.Authorization = `Bearer ${s.token}`;
    try {
        const resp = await fetch(url, { method: metodo, headers, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
        let data = null;
        try { data = await resp.json(); } catch (e) { }
        // Sesión vencida: se limpia para que la página ofrezca iniciar sesión de nuevo
        if (resp.status === 401 && conSesion) {
            try { localStorage.clear(); } catch (e) { }
        }
        return { ok: resp.ok, status: resp.status, data };
    } catch (e) {
        return { ok: false, status: 0, data: { message: 'No se pudo conectar con el servidor. Revisa tu internet.' } };
    }
}

const mensajeDe = (r, porDefecto = 'Ocurrió un error') => (r && r.data && (r.data.message || r.data.error)) || porDefecto;

// -----------------------------------------------------------------------------
// Formato
// -----------------------------------------------------------------------------
function escaparHTML(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const dinero = (n) => `$${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })}`;

/** "17:30" -> "5:30 PM" */
function hora12(texto) {
    const [h, m] = String(texto || '00:00').split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** "2026-11-27" -> "jueves 27 de noviembre" */
function fechaLarga(fecha, conAnio = false) {
    const d = new Date(`${fecha}T12:00:00`);
    return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', ...(conAnio ? { year: 'numeric' } : {}) });
}

const capitalizar = (texto) => String(texto || '').charAt(0).toUpperCase() + String(texto || '').slice(1);

/** Fecha local YYYY-MM-DD de un objeto Date */
function aFechaISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Lista de los próximos N días a partir de la primera fecha que cumple las 24 h */
function diasReservables(n = 21) {
    const inicio = new Date(Date.now() + PORTAL.horasReserva * 3600 * 1000);
    inicio.setHours(12, 0, 0, 0);
    const dias = [];
    for (let i = 0; i < n; i++) {
        const d = new Date(inicio);
        d.setDate(inicio.getDate() + i);
        dias.push({ fecha: aFechaISO(d), dow: d.getDay(), dia: d.getDate(),
                    nombreDia: d.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', ''),
                    mes: d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '') });
    }
    return dias;
}

const esCombo = (servicio) => /\+|completo/i.test(servicio.nombre || '');

const ESTADOS_CITA = {
    PENDIENTE: { texto: 'Pendiente', clase: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
    CONFIRMADA: { texto: 'Confirmada', clase: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
    COMPLETADA: { texto: 'Atendida', clase: 'bg-sky-500/10 text-sky-300 border-sky-500/30' },
    CANCELADA: { texto: 'Cancelada', clase: 'bg-red-500/10 text-red-300 border-red-500/30' },
    NO_ASISTIO: { texto: 'No asistió', clase: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30' }
};

// -----------------------------------------------------------------------------
// Avisos flotantes y ventana de confirmación
// -----------------------------------------------------------------------------
function mostrarToast(mensaje, tipo = 'exito') {
    let cont = document.getElementById('toast-container');
    if (!cont) {
        cont = document.createElement('div');
        cont.id = 'toast-container';
        cont.className = 'fixed top-4 inset-x-4 sm:inset-x-auto sm:right-5 z-[80] flex flex-col items-stretch sm:items-end gap-2 pointer-events-none';
        cont.setAttribute('aria-live', 'polite');
        document.body.appendChild(cont);
    }
    const colores = { exito: 'bg-emerald-600', error: 'bg-red-600', aviso: 'bg-amber-600' };
    const t = document.createElement('div');
    t.className = `text-white text-sm font-medium px-4 py-3 rounded-lg shadow-lg transition-opacity duration-300 ${colores[tipo] || colores.exito}`;
    t.textContent = mensaje;
    cont.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, tipo === 'error' ? 5000 : 3500);
}

function confirmarPortal(mensaje, { detalle = '', textoConfirmar = 'Confirmar', textoCancelar = 'Volver', peligro = false } = {}) {
    return new Promise((resolver) => {
        const fondo = document.createElement('div');
        fondo.className = 'fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-[90] p-4';
        fondo.innerHTML = `
            <div role="dialog" aria-modal="true" class="bg-brand-card border border-brand-border rounded-2xl w-full max-w-sm p-6 shadow-2xl">
                <h3 class="text-lg font-bold text-white">${escaparHTML(mensaje)}</h3>
                ${detalle ? `<p class="text-sm text-brand-muted mt-2">${escaparHTML(detalle)}</p>` : ''}
                <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-6">
                    <button type="button" data-accion="cancelar" class="px-4 py-2.5 rounded-lg border border-brand-border text-neutral-300 hover:bg-brand-cardElevated transition">${escaparHTML(textoCancelar)}</button>
                    <button type="button" data-accion="confirmar" class="px-4 py-2.5 rounded-lg font-bold transition ${peligro ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-brand-gold hover:bg-brand-goldHover text-black'}">${escaparHTML(textoConfirmar)}</button>
                </div>
            </div>`;
        const cerrar = (v) => { document.removeEventListener('keydown', tecla); fondo.remove(); resolver(v); };
        const tecla = (e) => { if (e.key === 'Escape') cerrar(false); };
        fondo.addEventListener('click', (e) => {
            if (e.target === fondo) return cerrar(false);
            const b = e.target.closest('button');
            if (b && b.dataset.accion) cerrar(b.dataset.accion === 'confirmar');
        });
        document.addEventListener('keydown', tecla);
        document.body.appendChild(fondo);
        fondo.querySelector('[data-accion="confirmar"]').focus();
    });
}

/** Botón en modo "cargando" */
function botonCargando(btn, cargando, texto = 'Procesando...') {
    if (!btn) return;
    if (cargando) {
        btn.dataset.textoOriginal = btn.innerHTML;
        btn.disabled = true;
        btn.classList.add('opacity-70', 'cursor-not-allowed');
        btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 inline" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>${escaparHTML(texto)}`;
    } else {
        btn.disabled = false;
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
        if (btn.dataset.textoOriginal !== undefined) btn.innerHTML = btn.dataset.textoOriginal;
    }
}

// -----------------------------------------------------------------------------
// Encabezado: botones según la sesión y menú para celular
// Cada página pone <div id="zona-sesion"></div> y opcionalmente <div id="zona-sesion-movil"></div>
// -----------------------------------------------------------------------------
function pintarZonaSesion() {
    const s = leerSesion();
    let html;
    if (s && s.rol === '3') {
        html = `<a href="mis-citas.html" class="text-sm font-semibold text-neutral-200 hover:text-white transition">Mis citas</a>
                <button type="button" onclick="cerrarSesionPortal()" class="text-xs font-semibold text-neutral-400 hover:text-white transition">Salir</button>`;
    } else if (s) {
        html = `<a href="dashboard.html" class="text-xs font-semibold text-neutral-300 hover:text-white transition">Ir al panel</a>`;
    } else {
        html = `<a href="cuenta.html" class="text-sm font-semibold text-neutral-200 hover:text-white transition">Iniciar sesión</a>`;
    }
    document.querySelectorAll('[data-zona-sesion]').forEach(el => { el.innerHTML = html; });
}

function activarMenuMovil() {
    const btn = document.getElementById('btn-menu-portal');
    const menu = document.getElementById('menu-portal');
    if (!btn || !menu) return;
    btn.addEventListener('click', () => {
        const abierto = menu.classList.toggle('hidden') === false;
        btn.setAttribute('aria-expanded', String(abierto));
    });
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
        menu.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
    }));
}

document.addEventListener('DOMContentLoaded', () => {
    pintarZonaSesion();
    activarMenuMovil();
    const anio = document.getElementById('anio-actual');
    if (anio) anio.textContent = new Date().getFullYear();
});
