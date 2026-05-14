// detalle.js - Script exclusivo para la página de detalle del producto


let idUser;
let carrito = [];

document.addEventListener('DOMContentLoaded', () => {
    // Sidebar / carrito
    const cartIcon = document.getElementById('cart-icon');
    const btnCloseCart = document.getElementById('btn-close-cart');
    const sidebar = document.getElementById('sidebar');
    const homeIcon = document.getElementById('home-icon');

    if (cartIcon) cartIcon.onclick = () => sidebar.classList.add('open');
    if (btnCloseCart) btnCloseCart.onclick = () => sidebar.classList.remove('open');
    if (homeIcon) homeIcon.onclick = () => window.location.href = 'Client.html';

    checkAuth();
    cargarDetalle();
    actualizarInterfazCarrito(); // Inicializa el badge/sidebar en 0
});

// Lee el ID del producto desde la URL: /Detalle.html?id=5
function getProductoId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

async function cargarDetalle() {
    const id = getProductoId();

    if (!id) {
        document.getElementById('det-titulo').innerText = 'Producto no encontrado';
        return;
    }

    try {
        const res = await fetch(`/productos/${id}`);
        if (!res.ok) throw new Error('No encontrado');
        const f = await res.json();

        const agotado = Number(f.cantidad) === 0;

        document.title = `${f.titulo} - Funko Hunter`;
        document.getElementById('det-titulo').innerText = f.titulo;
        document.getElementById('det-precio').innerText = `$${Number(f.precio).toFixed(2)}`;
        document.getElementById('det-desc').innerHTML = `
            <p>${escapeHtml(f.descripcion || 'Sin descripción disponible.')}</p>
            <p><strong>${agotado ? '⚠ Sin existencias' : `Disponibles: ${f.cantidad}`}</strong></p>
        `;


        // Imagen del detalle desde BD (columna f.imagen) o placeholder
        const imgEl = document.getElementById('mainProductImage');
        if (imgEl) {
            imgEl.src = await cargarImagenURL(f.imagen);
            imgEl.alt = f.titulo;
            imgEl.onerror = () => {
                imgEl.src = `https://via.placeholder.com/500x500/f8f8f8/333?text=${encodeURIComponent(f.titulo)}`;
            };
        }

        // Actualizar el badge "EN STOCK" / "AGOTADO"
        const statusBadge = document.querySelector('.status-badge');
        if (statusBadge) {
            if (agotado) {
                statusBadge.classList.remove('new');
                statusBadge.classList.add('agotado');
                statusBadge.textContent = 'AGOTADO';
                statusBadge.style.background = '#c0392b';
                statusBadge.style.color = '#fff';
            } else {
                statusBadge.textContent = 'EN STOCK';
            }
        }

        // Botón "Añadir al carrito"
        const btn = document.getElementById('btn-add-det');
        if (btn) {
            if (agotado) {
                btn.disabled = true;
                btn.innerHTML = '<i class="bi bi-x-circle" style="margin-right: 8px;"></i> Agotado';
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
            } else {
                btn.onclick = () => agregarAlCarrito(f._id, f.titulo);
            }
        }

    } catch (e) {
        document.getElementById('det-titulo').innerText = 'Funko no encontrado';
        console.error(e);
    }
}

// Helpers de escape para evitar romper HTML
function escapeHtml(t) {
    const div = document.createElement('div');
    div.textContent = t == null ? '' : String(t);
    return div.innerHTML;
}
function escapeAttr(t) {
    return escapeHtml(t).replace(/"/g, '&quot;');
}

// --- AUTENTICACIÓN ---
async function checkAuth() {
    try {

        const loginBtn = document.getElementById('login-btn');
        const userInfo = document.getElementById('user-info');
        const userPhoto = document.getElementById('user-photo');
        const userName = document.getElementById('user-name');
        const response = await fetch('/auth/whoami');

        if (response.ok) {
            const user = await response.json();
            idUser = user._id; // <--- Este es el ID de Mongo que ves en Compass
            loginBtn.classList.add('hidden');
            userInfo.classList.remove('hidden');
            
            // Llenar datos de Google en el HTML
            userPhoto.src = user.foto;
            userName.textContent = user.nombre.split(' ')[0]; // Muestra solo el primer nombre

            // Mostrar botón Admin si el usuario tiene rol 'admin'
            const adminLink = document.getElementById('admin-link');
            if (adminLink && user.rol === 'admin') {
                adminLink.classList.remove('hidden');
            }
            
            // Si el usuario ya tiene productos en su carrito de Mongo, los cargamos
            if (user.carrito && user.carrito.length > 0) {
                // Adaptamos el formato de Mongo al formato que usa tu script local
                carrito = user.carrito.map(item => ({
                    id: item.producto_id,
                    titulo: item.titulo,
                    qty: item.cantidad
                }));
                await actualizarInterfazCarrito();
            }
        }
    } catch (error) {
        console.log("Sesión no iniciada");
    }
}

// --- CARRITO ---
async function agregarAlCarrito(id, titulo) {
    console.log(id);
    try {
        // Ahora el ID es el string de MongoDB
        const res = await fetch(`/productos/${id}`);
        if (!res.ok) throw new Error("Producto no encontrado");
        
        const productoDB = await res.json();
        
        // Buscamos en el carrito local usando el ID de Mongo
        const itemExistente = carrito.find(item => item.id === id);

        if (itemExistente) {
            if (itemExistente.qty + 1 > productoDB.cantidad) {
                alert(`¡No! Solo hay ${productoDB.cantidad} disponibles.`);
                return; 
            }
            itemExistente.qty += 1;
        } else {
            carrito.push({ id: id, titulo: titulo, qty: 1 });
        }

        guardarYActualizar();
        document.getElementById('sidebar').classList.add('open');
    } catch (error) {
        console.error("Error al verificar cantidades:", error);
        alert("Error al conectar con la base de datos de productos.");
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
    console.log("usuario a guardar cambio",idUser);
    console.log("carrito de usuario cargado asi:",carrito);
    localStorage.setItem(`cart_user_${idUser}`, JSON.stringify(carrito));
    actualizarInterfazCarrito();
}


async function GuardarCarritoConcurrentDB() {
    if (!idUser) return; // No guardamos si no hay usuario logueado

    try {
        const payload = {
            idUsuario: idUser,
            items: carrito // Enviamos el array completo de objetos {id, titulo, qty}
        };

        const response = await fetch('/ActualizarCarritoDB', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log("Carrito sincronizado en la nube");
        }
    } catch (error) {
        console.error("Error al sincronizar con MongoDB:", error);
    }
}




async function actualizarInterfazCarrito() {
    console.log("tamaño del carrito", carrito.length, JSON.stringify(carrito));
    const list = document.getElementById('cart-list');
    const totalDisplay = document.getElementById('cart-total');
    const subtotalDisplay = document.getElementById('cart-subtotal');
    const badge = document.getElementById('cart-badge');

    // Siempre actualizamos el badge, aun si el carrito está vacío
    if (badge) {
        const totalPiezas = carrito.reduce((sum, item) => sum + Number(item.qty || 0), 0);
        badge.innerText = totalPiezas;
    }

    if (carrito.length === 0) {
        if (list) list.innerHTML = `<p style="text-align:center; padding:20px;">Carrito vacío</p>`;
        if (totalDisplay) totalDisplay.innerText = "$0.00";
        if (subtotalDisplay) subtotalDisplay.innerText = "$0.00";
        return;
    }

    const itemsParaServer = carrito.map(i => ({ id: i.id, cantidad: i.qty }));

    
    // ... código anterior ...

try {
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

    // ... resto del código (totales, etc.) ...


        // Totales: ambos vienen del servidor (calculados con los precios de la BD)
        const totalFormateado = `$${Number(data.total).toFixed(2)}`;
        if (totalDisplay) totalDisplay.innerText = totalFormateado;
        if (subtotalDisplay) subtotalDisplay.innerText = totalFormateado;

        // Sincronizamos títulos locales con la BD
        carrito.forEach((it, idx) => {
            if (data.items[idx]) {
                it.titulo = data.items[idx].titulo;
                // Opcional: it.precio = data.items[idx].precio_unitario;
            }
        });

    } catch (e) {
        console.error("Error total al actualizar interfaz:", e);
    }
}





async function CerrarCarrito(){
    
    try{
            // Llamada GET al endpoint /auth/logout
        fetch('/auth/logout', {
        method: 'GET',
        credentials: 'include' 
        })
        .then(response => {
            if (response.redirected) {
            // El servidor redirigió, así que seguimos la URL
            window.location.href = response.url;
            } else if (response.ok) {
            console.log('Logout exitoso');
            } else {
            console.error('Error al cerrar sesión');
            }
        })
        .catch(error => {
            console.error('Error en la petición:', error);
        });


    }catch(error){
        console.log("error al guardar el carrito actualizado en la base");
    }

}

async function VerPago() {
    // Navega a la página de detalle pasando el ID por la URL
    window.location.href = "Pagos.html";
}

/**
 * Redirige al catálogo con el término de búsqueda en la URL.
 * Client.html lo lee al cargar y ejecuta BuscarFunco().
 */
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