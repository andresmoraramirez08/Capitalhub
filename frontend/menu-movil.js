// =============================================================================
// CapitalHub - Menú lateral adaptable a celular (RNF-USA-01)
// En pantallas menores a 768px el menú se oculta y se abre con el botón ☰.
// Se incluye en todas las vistas del panel con <script src="menu-movil.js"></script>
// =============================================================================
(function () {
    const estilos = `
        #btn-menu-movil, #fondo-menu-movil { display: none; }

        @media (max-width: 767px) {
            body { display: block !important; height: auto !important; min-height: 100vh; }

            body > aside {
                position: fixed; top: 0; bottom: 0; left: 0;
                width: 16rem; z-index: 60; overflow-y: auto;
                transform: translateX(-100%);
                transition: transform 0.2s ease;
            }
            body.menu-abierto > aside { transform: translateX(0); }

            body > main {
                padding: 4.5rem 1rem 1.5rem !important;
                overflow: visible !important;
            }
            main header { flex-wrap: wrap; gap: 0.75rem; }
            main h1 { font-size: 1.5rem !important; }

            /* Formularios de 2 columnas pasan a 1 columna */
            main .grid-cols-2 { grid-template-columns: 1fr !important; }

            /* Las tablas se desplazan de lado en lugar de romper la pantalla */
            main table { display: block; overflow-x: auto; white-space: nowrap; }

            #btn-menu-movil {
                display: flex; align-items: center; justify-content: center;
                position: fixed; top: 0.75rem; left: 0.75rem; z-index: 70;
                width: 2.75rem; height: 2.75rem; border-radius: 0.6rem;
                background: #111111; border: 1px solid #3f3f46; color: #fff;
                font-size: 1.4rem; line-height: 1;
            }
            /* Con el menú abierto, la ✕ se coloca a un lado para no tapar el logo */
            body.menu-abierto #btn-menu-movil { left: calc(16rem + 0.75rem); }
            body.menu-abierto #fondo-menu-movil {
                display: block; position: fixed; inset: 0;
                background: rgba(0, 0, 0, 0.6); z-index: 55;
            }
        }
    `;

    const style = document.createElement('style');
    style.textContent = estilos;
    document.head.appendChild(style);

    document.addEventListener('DOMContentLoaded', () => {
        const aside = document.querySelector('body > aside');
        if (!aside) return;

        const boton = document.createElement('button');
        boton.id = 'btn-menu-movil';
        boton.type = 'button';
        boton.setAttribute('aria-label', 'Abrir menú');
        boton.textContent = '☰';

        const fondo = document.createElement('div');
        fondo.id = 'fondo-menu-movil';

        const alternar = (abrir) => {
            document.body.classList.toggle('menu-abierto', abrir);
            boton.textContent = abrir ? '✕' : '☰';
            boton.setAttribute('aria-label', abrir ? 'Cerrar menú' : 'Abrir menú');
        };

        boton.addEventListener('click', () => alternar(!document.body.classList.contains('menu-abierto')));
        fondo.addEventListener('click', () => alternar(false));
        aside.querySelectorAll('a').forEach(a => a.addEventListener('click', () => alternar(false)));

        document.body.appendChild(fondo);
        document.body.appendChild(boton);
    });
})();
