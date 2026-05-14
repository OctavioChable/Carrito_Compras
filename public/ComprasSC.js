let carrito = [];
let idUser; 

document.addEventListener('DOMContentLoaded', () => {
    // Referencias UI
    const homeIcon = document.getElementById('home-icon');
    const cartIcon = document.getElementById('cart-icon');
    const btnCloseCart = document.getElementById('btn-close-cart');
    const sidebar = document.getElementById('sidebar');

    if (homeIcon) homeIcon.onclick = volverAlHome;
    if (cartIcon) cartIcon.onclick = () => sidebar.classList.add('open');
    if (btnCloseCart) btnCloseCart.onclick = () => sidebar.classList.remove('open');

    // Inicialización
    checkAuth(); // <--- NUEVA: Verifica si inició sesió
    CargarComprasU();
    actualizarInterfazCarrito();
});

// --- NUEVA SECCIÓN: AUTENTICACIÓN ---

async function checkAuth() {
    try {
        const response = await fetch('/auth/whoami');

        const loginBtn = document.getElementById('login-btn');
        const userInfo = document.getElementById('user-info');
        const userPhoto = document.getElementById('user-photo');
        const userName = document.getElementById('user-name');

        if (response.ok) {
            const user = await response.json();
            loginBtn.classList.add('hidden');
            userInfo.classList.remove('hidden');

            userPhoto.src = user.foto;
            userName.textContent = user.nombre.split(' ')[0];

            // Con Mongo ya tenemos el _id directo en whoami

            // Mostrar botón Admin si el usuario tiene rol 'admin'
            const adminLink = document.getElementById('admin-link');
            if (adminLink && user.rol === 'admin') {
                adminLink.classList.remove('hidden');
            }
            idUser = user._id;
            console.log("idUser:", idUser);

            // Cargamos el carrito del localStorage
            carrito = JSON.parse(localStorage.getItem(`cart_user_${idUser}`)) || [];
            await actualizarInterfazCarrito();
        } else {
            loginBtn.classList.remove('hidden');
            userInfo.classList.add('hidden');
        }
    } catch (error) {
        console.log("Usuario no autenticado");
    }
}

function volverAlHome() {
    window.location.href = 'Client.html';
}

// --- LLAMADAS A LA API ---

async function verDetalle(id) {
    // Navega a la página de detalle pasando el ID por la URL
    window.location.href = `Detalle.html?id=${id}`;
}

async function VerPago() {
    // Navega a la página de detalle pasando el ID por la URL
    window.location.href = "Pagos.html";
}

// --- LÓGICA DEL CARRITO ---


async function agregarAlCarrito(id, titulo) {
    try {
        const res = await fetch(`/productos/${id}`);
        const productoDB = await res.json();
        const itemExistente = carrito.find(item => item.id === id);

        if (itemExistente) {
            if (itemExistente.qty + 1 > productoDB.cantidad) {
                alert(`¡No! Solo hay ${productoDB.cantidad} disponibles de "${titulo}".`);
                return; 
            }
            itemExistente.qty += 1;
        } else {
            if (productoDB.cantidad < 1) {
                alert("Lo sentimos, este Funko está agotado.");
                return;
            }
            carrito.push({ id, titulo, qty: 1 });
        }

        guardarYActualizar();
        document.getElementById('sidebar').classList.add('open');
    } catch (error) {
        console.error("Error al verificar cantidades:", error);
    }
}


async function cambiarCantidad(index, delta) {
    const item = carrito[index];
    const nuevaCantidad = item.qty + delta;

    if (nuevaCantidad < 1) return;

    try {
        const res = await fetch(`/productos/${item.id}`);
        const productoDB = await res.json();

        if (nuevaCantidad > productoDB.cantidad) {
            alert(`Lo sentimos, solo quedan ${productoDB.cantidad} piezas.`);
            return;
        }

        item.qty = nuevaCantidad;
        guardarYActualizar();
    } catch (e) { console.error("Error al validar", e); }
}


function eliminarDelCarrito(index) {
    carrito.splice(index, 1);
    guardarYActualizar();
}


function guardarYActualizar() {
    GuardarCarritoConcurrentDB();
    localStorage.setItem(`cart_user_${idUser}`, JSON.stringify(carrito));
    actualizarInterfazCarrito();
}

async function GuardarCarritoConcurrentDB() {
    if (!idUser) return;
    try {
        // El endpoint /ActualizarCarritoDB ahora espera { items, idUsuario }
        const payload = {
            items: carrito.map(i => ({
                id: i.id,
                titulo: i.titulo,
                qty: Number(i.qty)
            })),
            idUsuario: idUser
        };

        const response = await fetch('/ActualizarCarritoDB', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("Error al actualizar carrito en BD");
        const data = await response.json();
        console.log("Carrito sincronizado:", data);
    } catch (error) {
        console.error("Error al sincronizar carrito con BD:", error);
    }
}


async function actualizarInterfazCarrito() {
    const list = document.getElementById('cart-list');
    const totalDisplay = document.getElementById('cart-total');
    const subtotalDisplay = document.getElementById('cart-subtotal');
    const badge = document.getElementById('cart-badge');

    if (badge) {
        const totalPiezas = (carrito || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
        badge.innerText = totalPiezas;
    }

    if (!carrito || carrito.length === 0) {
        console.log("Carrito vacío", carrito);
        if (list) list.innerHTML = `<p style="text-align:center; padding:20px;">Carrito vacío</p>`;
        if (totalDisplay) totalDisplay.innerText = '$0.00';
        if (subtotalDisplay) subtotalDisplay.innerText = '$0.00';
        console.log("Carrito vacío, interfaz actualizada.");
        return;
    }
    const itemsParaServer = carrito.map(i => ({ id: i.id, cantidad: i.qty }));
    console.log(    "Actualizando interfaz del carrito con items:", carrito);
try {
    console.log("try");
    console.log("items:", itemsParaServer);
    const res = await fetch('/carrito/detalle', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ items: itemsParaServer })
    });
    const data = await res.json();

    if (!list) return;

    // 1. Creamos un array de promesas usando map + async
    const promesasHtml = data.items.map(async (item, i) => {
        const imgSrc = await cargarImagenURL(item.imagen);
        
        const advertenciaStock = !item.stock_ok
            ? `<small style="color:#c00; display:block;">Solo hay ${item.stock_disponible} disponibles</small>`
            : '';

        return `
        <div class="cart-item-modern">
            <img src="${imgSrc}" alt="${escapeAttr(item.titulo)}" class="cart-item-img-modern"
                 onerror="this.src='img/placeholder.png'">
            <div class="cart-item-details-modern">
                <div class="cart-item-header-modern">
                    <span class="cart-item-title-modern">${escapeHtml(item.titulo)}</span>
                    <i class="bi bi-trash3 cart-item-delete-modern" onclick="eliminarDelCarrito(${i})"></i>
                </div>
                <span class="cart-item-subtitle-modern">
                    $${item.precio_unitario.toFixed(2)} c/u · Subtotal: $${item.subtotal.toFixed(2)}
                </span>
                ${advertenciaStock}
                <div class="cart-item-controls-modern">
                    <div class="cart-qty-pill-modern">
                        <button class="qty-btn-modern" onclick="cambiarCantidad(${i}, -1)"><i class="bi bi-dash"></i></button>
                        <span class="qty-val-modern">${item.cantidad}</span>
                        <button class="qty-btn-modern" onclick="cambiarCantidad(${i}, 1)"><i class="bi bi-plus"></i></button>
                    </div>
                </div>
            </div>
        </div>
        `;
    });

    // 2. Esperamos a que todas las promesas se resuelvan
    const itemsHtml = await Promise.all(promesasHtml);

    // 3. Unimos el array de strings y lo insertamos en el DOM
    list.innerHTML = itemsHtml.join('');


        const totalFormateado = `$${Number(data.total).toFixed(2)}`;
        if (totalDisplay) totalDisplay.innerText = totalFormateado;
        if (subtotalDisplay) subtotalDisplay.innerText = totalFormateado;

        carrito.forEach((it, idx) => {
            if (data.items[idx]) {
                it.titulo = data.items[idx].titulo;
                // Opcional: it.precio = data.items[idx].precio_unitario;
            }
        });

    } catch (e) {
        console.error("Error total:", e);
    }
}

function escapeHtml(t) {
    const div = document.createElement('div');
    div.textContent = t == null ? '' : String(t);
    return div.innerHTML;
}


function escapeAttr(t) {
    return escapeHtml(t).replace(/"/g, '&quot;');
}



async function cargarImagenURL(keyimagen){
    const res = await fetch(`/files/${keyimagen}`);
    const data = await res.json();
    return data.url;
}

async function CerrarCarrito() {
    try {
        // Primero sincronizamos el carrito con la BD usando el payload correcto
        await GuardarCarritoConcurrentDB();
    } catch (e) {
        console.warn("No se pudo sincronizar el carrito antes de cerrar sesión:", e);
    }

    // Redirigir a /auth/logout (esto hace el logout y redirige al inicio)
    window.location.href = '/auth/logout';
}


async function CargarComprasU() {
    try {
        const res = await fetch('/MisCompras');

        if (res.status === 401) {
            renderizarCompras([]);
            console.log("Usuario no logueado");
            return;
        }

        if (!res.ok) {
            console.log("Error al cargar compras");
            renderizarCompras([]);
            return;
        }

        const compras = await res.json();
        console.log("Compras recibidas:", compras);

        await renderizarCompras(compras);

    } catch (error) {
        console.error("Error al cargar datos de las compras:", error);
        renderizarCompras([]);
    }
}


// --- Renderiza las tarjetas de compras en el DOM ---
// Recibe el array que devuelve /MisCompras con los productos ya enriquecidos
// (título, imagen, precio). No necesita hacer fetch por cada producto.
async function renderizarCompras(compras) {
    const contenedor = document.querySelector('.orders-list');
    if (!contenedor) return;

    if (!compras || compras.length === 0) {
        contenedor.innerHTML = `
            <div class="order-card" style="padding: 3rem; text-align: center;">
                <h2>Aún no tienes compras registradas</h2>
                <p style="color: #666; margin-top: 10px;">Cuando realices una compra, aparecerá aquí.</p>
            </div>
        `;
        return;
    }

    contenedor.innerHTML = '';

    for (const compra of compras) {
        const productos = compra.productos || [];

        // Total de piezas (suma de cantidades)
        const totalPiezas = productos.reduce(
            (acc, p) => acc + Number(p.cantidad || 0), 0
        );

        // Fecha legible
        let fechaFormateada = '';
        if (compra.fecha) {
            const f = new Date(compra.fecha);
            if (!isNaN(f)) {
                fechaFormateada = f.toLocaleDateString('es-MX', {
                    day: 'numeric', month: 'long', year: 'numeric'
                });
            }
        }

        // Color del pill según el status
        const statusClass =
            compra.status === 'Completado' ? 'delivered' :
            compra.status === 'Pendiente'  ? 'pending' :
            compra.status === 'Fallido'    ? 'failed' : '';
        const statusIcon =
            compra.status === 'Completado' ? 'bi-check-circle' :
            compra.status === 'Pendiente'  ? 'bi-hourglass-split' :
            compra.status === 'Fallido'    ? 'bi-x-circle' : 'bi-circle';
        
        const thumbnailsHTML = await Promise.all(productos.map(async (f) => {
        // 3. Ahora el await funciona correctamente
        const imgSrc = await cargarImagenURL(f.imagen); 
        
        return `
                <div class="order-item-row">
                <div class="item-product-info">
                    <img src="${imgSrc}" alt="${f.titulo}"
                         onerror="this.src='https://placehold.co/600x400/EEE/31343C?text=Funko'">
                    <div>
                        <h4>${f.titulo}</h4>
                        <p>Funko Pop · Cant. ${f.cantidad} · $${Number(f.precio || 0).toFixed(2)} c/u</p>
                    </div>
                </div>
            </div>
            `;
    }));

    // 4. Unimos el array de strings resultante
  


        


        // Función para armar la URL de la imagen de un producto
        
        // Armamos la tarjeta
        const shortId = String(compra._id).slice(-6).toUpperCase();
        const tarjeta = `
            <div class="order-card">
                <div class="order-header" onclick="toggleOrderDetails(this)">
                    <div class="order-header-left">
                        <div class="order-basic-info">
                            <div class="order-id-group">
                                <h3>Pedido #${shortId}</h3>
                                <span class="status-pill ${statusClass}">
                                    <i class="bi ${statusIcon}"></i> ${compra.status || '—'}
                                </span>
                            </div>
                            <p class="order-date-items">
                                ${fechaFormateada || 'Reciente'}
                                <span class="dot-separator">·</span> ${totalPiezas} artículos
                            </p>
                        </div>
                    </div>
                    <div class="order-header-right">
                        <span class="order-total-price">$${Number(compra.total).toFixed(2)}</span>
                        <i class="bi bi-chevron-down expand-icon"></i>
                    </div>
                </div>

                <div class="order-body">
                    <div class="progress-tracker">
                        <div class="progress-step completed"><div class="step-icon"><i class="bi bi-check"></i></div><span class="step-label">Confirmado</span></div>
                        <div class="progress-line ${compra.status === 'Completado' ? 'completed' : ''}"></div>
                        <div class="progress-step ${compra.status === 'Completado' ? 'completed' : ''}"><div class="step-dot"></div></div>
                        <div class="progress-line ${compra.status === 'Completado' ? 'completed' : ''}"></div>
                        <div class="progress-step ${compra.status === 'Completado' ? 'completed' : ''}"><div class="step-icon"><i class="bi bi-check"></i></div><span class="step-label">${compra.status === 'Completado' ? 'Entregado' : compra.status}</span></div>
                    </div>

                    <div class="order-items-list">
                        ${thumbnailsHTML}
                    </div>
                </div>
            </div>
        `;

        contenedor.insertAdjacentHTML('beforeend', tarjeta);
    }
}


// Funcion auxiliar para el boton "Volver a comprar"
function volverAComprar(idcompra) {
    console.log("Volver a comprar pedido:", idcompra);
    window.location.href = 'Client.html';
}


function irABuscar(event) {
    if (event) event.preventDefault();
    const input = document.getElementById('search-input');
    const q = input ? input.value.trim() : '';
    window.location.href = q ? `Client.html?q=${encodeURIComponent(q)}` : 'Client.html';
    return false;
}



async function cargarImagenURL(keyimagen){
    const res = await fetch(`/files/${keyimagen}`);
    const data = await res.json();
    return data.url;
}
