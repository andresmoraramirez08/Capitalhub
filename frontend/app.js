// =============================================================================
// CapitalHub - Utilidades compartidas del panel (back office)
// Se carga en todas las vistas del panel, antes del script propio de cada página:
//   <script src="app.js"></script>
// Contiene: protección de sesión/rol, sesión vencida, toasts, spinner de botones,
// escape de HTML y cierre de sesión. Así no se repite el mismo código en cada vista.
// =============================================================================

// Páginas que solo puede abrir el administrador (rol 1)
const CH_PAGINAS_ADMIN = ['barberos.html', 'servicios.html', 'clientes.html', 'catalogo.html'];
// Opciones del menú lateral que se ocultan al barbero
const CH_MENUS_ADMIN = ['menu-catalogo', 'menu-clientes', 'menu-barberos', 'menu-servicios'];

// -----------------------------------------------------------------------------
// 1. Protección de la página (se ejecuta de inmediato, antes de pintar nada)
// -----------------------------------------------------------------------------
(function protegerPagina() {
    const pagina = window.location.pathname.split('/').pop() || 'dashboard.html';
    if (!localStorage.getItem('token')) {
        window.location.replace('login.html');
        return;
    }
    // Un cliente (rol 3) no tiene nada que hacer en el panel: va a su portal
    if (localStorage.getItem('rol') === '3') {
        window.location.replace('mis-citas.html');
        return;
    }
    if (localStorage.getItem('rol') !== '1' && CH_PAGINAS_ADMIN.includes(pagina)) {
        window.location.replace('dashboard.html');
    }
})();

// -----------------------------------------------------------------------------
// 2. Sesión vencida: si cualquier petición a la API responde 401, regresamos al login
// -----------------------------------------------------------------------------
(function vigilarSesion() {
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = async (...args) => {
        const respuesta = await fetchOriginal(...args);
        const url = String((args[0] && args[0].url) || args[0] || '');
        if (respuesta.status === 401 && url.includes('/api/') && !url.includes('/api/auth/')) {
            localStorage.clear();
            window.location.replace('login.html?sesion=expirada');
        }
        return respuesta;
    };
})();

// -----------------------------------------------------------------------------
// 3. Menú según el rol (al cargar la página)
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('rol') !== '1') {
        CH_MENUS_ADMIN.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        // El barbero sí ve sus comisiones (en modo consulta)
        const menuComisiones = document.getElementById('menu-comisiones');
        if (menuComisiones) menuComisiones.textContent = 'Mis Comisiones';
    }
});

// -----------------------------------------------------------------------------
// 4. Utilidades de interfaz
// -----------------------------------------------------------------------------

/** Notificación flotante. tipo: 'exito' | 'error' | 'aviso' */
function mostrarToast(mensaje, tipo = 'exito') {
    let contenedor = document.getElementById('toast-container');
    if (!contenedor) {
        contenedor = document.createElement('div');
        contenedor.id = 'toast-container';
        contenedor.className = 'fixed top-5 right-5 z-[80] flex flex-col gap-2 pointer-events-none';
        document.body.appendChild(contenedor);
    }
    const colores = { exito: 'bg-emerald-600', error: 'bg-red-600', aviso: 'bg-amber-600' };
    const toast = document.createElement('div');
    toast.className = `flex items-center text-white text-sm font-medium px-4 py-3 rounded shadow-lg transition-all duration-300 transform translate-x-full ${colores[tipo] || colores.exito}`;
    toast.textContent = mensaje;
    contenedor.appendChild(toast);
    setTimeout(() => toast.classList.remove('translate-x-full'), 10);
    setTimeout(() => {
        toast.classList.add('translate-x-full');
        setTimeout(() => toast.remove(), 300);
    }, tipo === 'error' ? 4500 : 3000);
}

/** Deshabilita un botón y muestra un spinner mientras se procesa una petición */
function toggleCargando(btn, cargando) {
    if (!btn) return;
    if (cargando) {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.dataset.textoOriginal = btn.innerHTML;
        btn.classList.add('opacity-75', 'cursor-not-allowed');
        btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>Procesando...`;
    } else {
        btn.disabled = false;
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
        if (btn.dataset.textoOriginal !== undefined) btn.innerHTML = btn.dataset.textoOriginal;
    }
}

/** Escapa texto antes de insertarlo con innerHTML (evita inyección de código) */
function escaparHTML(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Lee el mensaje de error que manda el backend (message o error) */
async function leerError(respuesta, porDefecto = 'Ocurrió un error') {
    try {
        const data = await respuesta.json();
        return data.message || data.error || porDefecto;
    } catch (e) {
        return porDefecto;
    }
}

/** Fecha de hoy en formato YYYY-MM-DD (hora local) */
function fechaHoyLocal() {
    const f = new Date();
    f.setMinutes(f.getMinutes() - f.getTimezoneOffset());
    return f.toISOString().split('T')[0];
}

/** "17:30:00" -> "5:30 PM" */
function hora12(horaTexto) {
    const [h, m] = String(horaTexto || '00:00').split(':').map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Correos internos generados para clientes sin correo: no se muestran */
function correoVisible(email) {
    return email && !String(email).endsWith('@clientes.capitalhub.local') ? email : '';
}

function cerrarSesion() {
    localStorage.clear();
    window.location.href = 'login.html';
}

// -----------------------------------------------------------------------------
// 5. Reportes: exportar a Excel (CSV) e imprimir / guardar como PDF
// -----------------------------------------------------------------------------

/**
 * Descarga un archivo CSV que Excel abre directamente (con acentos correctos).
 * encabezados: ['Fecha', 'Barbero', ...]  filas: [['2026-11-25', 'Kevin', ...], ...]
 */
function exportarCSV(nombreArchivo, encabezados, filas) {
    const celda = (v) => {
        const texto = String(v ?? '');
        // Comillas si trae coma, comillas o salto de línea
        return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };
    const contenido = [encabezados, ...filas].map(fila => fila.map(celda).join(',')).join('\r\n');
    // ﻿ (BOM) hace que Excel reconozca UTF-8 y muestre bien ñ y acentos
    const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8;' });
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(blob);
    enlace.download = `${nombreArchivo}_${fechaHoyLocal()}.csv`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

/** Abre el diálogo de impresión; ahí se puede elegir "Guardar como PDF" */
function imprimirReporte() {
    window.print();
}

// Estilos de impresión: fondo blanco, sin menú ni botones, tablas legibles
(function estilosImpresion() {
    const style = document.createElement('style');
    style.textContent = `
        .solo-impresion { display: none; }
        @media print {
            aside, #btn-menu-movil, #fondo-menu-movil, #toast-container, button, select, input, .no-imprimir { display: none !important; }
            .solo-impresion { display: block !important; }
            html, body { height: auto !important; display: block !important; background: #fff !important; }
            * { color: #000 !important; background: transparent !important; box-shadow: none !important; }
            main { padding: 0 !important; overflow: visible !important; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #999 !important; padding: 4px 6px !important; font-size: 11px; }
            .rounded-xl, .border { border-color: #999 !important; }
        }
    `;
    document.head.appendChild(style);
})();

// -----------------------------------------------------------------------------
// 6. Ventana de confirmación con el estilo de la app (reemplaza al confirm() del navegador)
// Uso:  if (!(await confirmar('¿Cancelar esta venta?', { detalle: '...', textoConfirmar: 'Sí, cancelar', peligro: true }))) return;
// -----------------------------------------------------------------------------
function confirmar(mensaje, opciones = {}) {
    const {
        detalle = '',
        textoConfirmar = 'Confirmar',
        textoCancelar = 'Volver',
        peligro = false
    } = opciones;

    return new Promise((resolver) => {
        const fondo = document.createElement('div');
        fondo.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-[90] p-4';
        fondo.innerHTML = `
            <div role="dialog" aria-modal="true" class="bg-[#111111] border border-zinc-800 rounded-xl w-full max-w-sm p-6 shadow-2xl">
                <h3 class="text-lg font-bold text-white">${escaparHTML(mensaje)}</h3>
                ${detalle ? `<p class="text-sm text-zinc-400 mt-2">${escaparHTML(detalle)}</p>` : ''}
                <div class="flex justify-end gap-3 mt-6">
                    <button type="button" data-accion="cancelar" class="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition">${escaparHTML(textoCancelar)}</button>
                    <button type="button" data-accion="confirmar" class="px-4 py-2 rounded-lg font-semibold transition ${peligro
                        ? 'bg-red-600 hover:bg-red-500 text-white'
                        : 'bg-zinc-100 hover:bg-white text-black'}">${escaparHTML(textoConfirmar)}</button>
                </div>
            </div>`;

        const cerrar = (resultado) => {
            document.removeEventListener('keydown', alTeclear);
            fondo.remove();
            resolver(resultado);
        };
        const alTeclear = (e) => {
            if (e.key === 'Escape') cerrar(false);
            if (e.key === 'Enter') cerrar(true);
        };

        fondo.addEventListener('click', (e) => {
            if (e.target === fondo) return cerrar(false); // clic fuera de la ventana = cancelar
            const accion = e.target.closest('button') && e.target.closest('button').dataset.accion;
            if (accion) cerrar(accion === 'confirmar');
        });
        document.addEventListener('keydown', alTeclear);
        document.body.appendChild(fondo);
        fondo.querySelector('[data-accion="confirmar"]').focus();
    });
}
