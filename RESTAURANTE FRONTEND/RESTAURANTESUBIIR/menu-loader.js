// menu-loader.js - Carga dinámica del menú desde localStorage

const STORAGE_KEY = 'platillos_menu';
const WHATSAPP_NUMBER = '573028599105';

// Platillos por defecto si no hay datos
const DEFAULT_PLATILLOS = [
    {
        id: 'c1',
        codigo: 'C1',
        nombre: 'Combo C1 con Carne',
        descripcion: 'Arroz frito, papas fritas crujientes y jugosa carne de cerdo asada, acompañado de salsas especiales',
        precio: '26000',
        imagen: 'https://i.imgur.com/5hwtuhd.png'
    },
    {
        id: 'c2',
        codigo: 'C2',
        nombre: 'Combo 6 Alitas',
        descripcion: 'Arroz frito, papas fritas doradas y 6 alitas de pollo crujientes, servidas con salsas agridulce y soya',
        precio: '24000',
        imagen: 'https://i.imgur.com/YutSYEp.png'
    },
    {
        id: 'c3',
        codigo: 'C3',
        nombre: 'Combo C3 con Chop Suey',
        descripcion: 'Generosa porción de arroz frito y fideos chop suey salteados con pollo, vegetales frescos y salsa especial',
        precio: '24000',
        imagen: 'https://i.imgur.com/kWgvJ1p.jpeg'
    },
    {
        id: 'c4',
        codigo: 'C4',
        nombre: 'Pachin',
        descripcion: 'Espectacular montaña de arroz frito salteado con camarones, surimi, cerdo y vegetales frescos al wok',
        precio: '24000',
        imagen: 'https://i.imgur.com/jvdT3Lv.jpeg'
    },
    {
        id: 'c5',
        codigo: 'C5',
        nombre: 'Cerdo Agridulce',
        descripcion: 'Cerdo crujiente bañado en salsa agridulce con piña y pimientos',
        precio: '24000',
        imagen: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&h=400&fit=crop'
    },
    {
        id: 'c6',
        codigo: 'C6',
        nombre: 'Dumplings al Vapor',
        descripcion: '8 dumplings rellenos de cerdo y vegetales, servidos con salsa de soya',
        precio: '25000',
        imagen: 'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=600&h=400&fit=crop'
    }
];

// Formatear precio
function formatPrice(price) {
    return `$${parseInt(price).toLocaleString('es-CO')}`;
}

// Cargar platillos del localStorage
function loadPlatillosFromStorage() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        } else {
            // Si no hay datos, guardar los por defecto
            localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PLATILLOS));
            return DEFAULT_PLATILLOS;
        }
    } catch (error) {
        console.error('Error cargando platillos:', error);
        return DEFAULT_PLATILLOS;
    }
}

// Crear tarjeta de platillo
function createPlatilloCard(platillo) {
    const card = document.createElement('div');
    card.className = 'platillo-card';
    
    card.innerHTML = `
        <img src="${platillo.imagen}" alt="${platillo.nombre}" class="platillo-imagen">
        <div class="platillo-info">
            <span class="platillo-codigo">${platillo.codigo}</span>
            <h2 class="platillo-nombre">${platillo.nombre}</h2>
            <p class="platillo-descripcion">${platillo.descripcion}</p>
            <div class="platillo-precio">${formatPrice(platillo.precio)}</div>
            <button class="btn-pedir" onclick="mostrarFormularioPedido('${platillo.codigo}', '${platillo.nombre.replace(/'/g, "\\'")}', '${formatPrice(platillo.precio)}')">
                <span class="whatsapp-icon">💬</span>Pedir por WhatsApp
            </button>
        </div>
    `;
    
    return card;
}

// Renderizar menú
function renderMenu() {
    const menuGrid = document.querySelector('.menu-grid');
    if (!menuGrid) {
        console.error('No se encontró el contenedor .menu-grid');
        return;
    }

    // Mostrar mensaje de carga
    menuGrid.innerHTML = '<div style="color: #FFD700; text-align: center; padding: 40px; width: 100%;">⏳ Cargando menú...</div>';

    // Cargar platillos (setTimeout para simular carga y permitir que se vea el mensaje)
    setTimeout(() => {
        const platillos = loadPlatillosFromStorage();

        // Limpiar y renderizar
        menuGrid.innerHTML = '';
        
        if (platillos.length === 0) {
            menuGrid.innerHTML = '<div style="color: #FFD700; text-align: center; padding: 40px; width: 100%;">🍽 No hay platillos disponibles</div>';
            return;
        }

        platillos.forEach(platillo => {
            const card = createPlatilloCard(platillo);
            menuGrid.appendChild(card);
        });

        console.log(`✅ Menú cargado: ${platillos.length} platillos`);
    }, 300);
}

// Función para refrescar el menú (útil desde admin)
function refreshMenu() {
    renderMenu();
}

// Inicializar cuando cargue el DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderMenu);
} else {
    renderMenu();
}