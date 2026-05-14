let carrito = [];
let idUser;
let cargadosiono = false;
let paginaActual = 1;
const itemsPorPagina = 5; // Ajusta cuántos productos quieres 
let todosLosProductos = []; 

document.cookie;

document.addEventListener('DOMContentLoaded', () => {
    // Referencias UI
    const homeIcon = document.getElementById('home-icon');
    const cartIcon = document.getElementById('cart-icon');
    const ComprasIcon = document.getElementById('compras-icon');
    const btnCloseCart = document.getElementById('btn-close-cart');
    const sidebar = document.getElementById('sidebar');

    if (homeIcon) homeIcon.onclick = volverAlHome;
    if (ComprasIcon) ComprasIcon.onclick= () => CargarComprasU();
    if (cartIcon) cartIcon.onclick = () => sidebar.classList.add('open');
    if (btnCloseCart) btnCloseCart.onclick = () => sidebar.classList.remove('open');

    // Inicialización
    checkAuth();           // verifica sesión y carga el carrito si hay usuario
    actualizarInterfazCarrito(); // deja el badge/total en 0 al arrancar

    // Si vienen con ?q=... desde otra página, ejecutamos la búsqueda
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q) {
        const input = document.getElementById('search-input');
        if (input) input.value = q;
        BuscarFunco();
    } else {
        cargarCatalogo();
    }
});

// --- NUEVA SECCIÓN: AUTENTICACIÓN ---
//nuevo 
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

            // Mostrar el botón de Admin si el usuario tiene rol 'admin'
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


function volverAlHome() {
    window.location.href = 'Client.html';
      
}

function CargarComprasU(){
    window.location.href = 'MisCompras.html';
}

//nuevo 
// --- LLAMADAS A LA API ---
async function cargarCatalogo() {
    try {
        const res = await fetch('/productos'); 
        todosLosProductos = await res.json();
        
        // Renderizamos la primera página por defecto
        await renderizarPagina(1);
    } catch (e) { 
        console.error("Error catálogo:", e); 
    }
}


async function renderizarPagina(pagina) { // 1. Agregamos async aquí
    paginaActual = pagina;
    const catalog = document.getElementById('catalog');
    
    const inicio = (pagina - 1) * itemsPorPagina;
    const fin = inicio + itemsPorPagina;
    const productosVisibles = todosLosProductos.slice(inicio, fin);

    // 2. Usamos Promise.all para esperar a que todos los map terminen
    const tarjetasHtml = await Promise.all(productosVisibles.map(async (f) => {
        const agotado = Number(f.cantidad) === 0;
        
        // 3. Ahora el await funciona correctamente
        const imgSrc = await cargarImagenURL(f.imagen); 
        
        return `
            <div class="product-card ${agotado ? 'product-card-agotado' : ''}">
                <img src="${imgSrc}" alt="${escapeAttr(f.titulo)}" onclick="verDetalle('${f._id}')">
                ${agotado ? '<span class="badge-agotado">AGOTADO</span>' : ''}
                <div class="card-info">
                    <h4>${escapeHtml(f.titulo)}</h4>
                    <span class="stock-info">${agotado ? 'Sin existencias' : `Stock: ${f.cantidad}`}</span>
                    <div class="price-row">
                        <span class="price">$${Number(f.precio).toFixed(2)}</span>
                        <button class="btn-add-modern" ${agotado ? 'disabled' : ''} onclick="agregarAlCarrito('${f._id}', '${escapeAttr(f.titulo)}')">
                            <i class="bi bi-cart-plus"></i>
                        </button>
                    </div>
                </div>
            </div>`;
    }));

    // 4. Unimos el array de strings resultante
    catalog.innerHTML = tarjetasHtml.join('');

    crearControlesPaginacion();
}

function crearControlesPaginacion() {
    const totalPaginas = Math.ceil(todosLosProductos.length / itemsPorPagina);
    const container = document.getElementById('pagination-container');
    if (!container) return;

    let html = '';

    // 1. Botón Anterior
    html += `<button ${paginaActual === 1 ? 'disabled' : ''} onclick="renderizarPagina(${paginaActual - 1})">
                <i class="bi bi-chevron-left"></i>
             </button>`;

    // 2. Lógica de Números y Puntos Suspensivos
    const rango = 2; // Cuántos números mostrar a los lados de la página actual
    
    for (let i = 1; i <= totalPaginas; i++) {
        // Siempre mostrar la primera, la última, y las cercanas a la actual
        if (i === 1 || i === totalPaginas || (i >= paginaActual - rango && i <= paginaActual + rango)) {
            html += `<button class="${i === paginaActual ? 'active' : ''}" onclick="renderizarPagina(${i})">${i}</button>`;
        } 
        // Mostrar puntos suspensivos si hay un salto
        else if (i === paginaActual - rango - 1 || i === paginaActual + rango + 1) {
            html += `<span class="dots">...</span>`;
        }
    }

    // 3. Botón Siguiente
    html += `<button ${paginaActual === totalPaginas ? 'disabled' : ''} onclick="renderizarPagina(${paginaActual + 1})">
                <i class="bi bi-chevron-right"></i>
             </button>`;

    container.innerHTML = html;
}

// Helpers para evitar romper el HTML con títulos que tengan comillas o <
function escapeHtml(t) {
    const div = document.createElement('div');
    div.textContent = t == null ? '' : String(t);
    return div.innerHTML;
}
function escapeAttr(t) {
    return escapeHtml(t).replace(/"/g, '&quot;');
}

async function verDetalle(id) {
    // Navega a la página de detalle pasando el ID por la URL
    window.location.href = `Detalle.html?id=${id}`;
}

async function VerPago() {
    // Navega a la página de detalle pasando el ID por la URL
    window.location.href = "Pagos.html";
}


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


async function BuscarFunco() {
    const valorServer = document.getElementById("search-input").value;

    try {
        const res = await fetch(`/Retorno?FunkitoBuscadito=${encodeURIComponent(valorServer)}`);
        const data = await res.json();
        const headCatalog = document.getElementById("headCatalog");

        if (data.length === 0) {
            headCatalog.innerText = `No hay resultados para la búsqueda: "${valorServer}"`;
        } else {
            headCatalog.innerText = `Resultados para la búsqueda: "${valorServer}"`;
        }

        const catalog = document.getElementById('catalog');

        // 1. Generamos el array de promesas (map con async)
        const promesasProductos = data.map(async (f) => {
            const agotado = Number(f.cantidad) === 0;
            
            // 2. Ahora el await espera la URL de Cloudinary correctamente
            const imgSrc = await cargarImagenURL(f.imagen);
            console.log("img src buscado", imgSrc);

            return `
                <div class="product-card ${agotado ? 'product-card-agotado' : ''}">
                    <img src="${imgSrc}"
                         alt="${escapeAttr(f.titulo)}"
                         onclick="verDetalle('${f._id}')"
                         onerror="this.src='https://via.placeholder.com/250x300/f8f8f8/333?text=${encodeURIComponent(f.titulo)}'">

                    ${agotado ? '<span class="badge-agotado">AGOTADO</span>' : ''}

                    <div class="card-info">
                        <h4>${escapeHtml(f.titulo)}</h4>
                        <span class="stock-info">
                            ${agotado ? 'Sin existencias' : `Stock disponible: ${f.cantidad}`}
                        </span>
                        <div class="price-row">
                            <span class="price">$${Number(f.precio).toFixed(2)}</span>
                            
                            <button
                                class="btn-add-modern"
                                ${agotado ? 'disabled' : ''}
                                onclick="agregarAlCarrito('${f._id}', '${escapeAttr(f.titulo)}')"
                                title="${agotado ? 'Agotado' : 'Añadir al carrito'}"
                            >
                                <i class="bi ${agotado ? 'bi-x-circle' : 'bi-cart-plus'}"></i>
                            </button>
                        </div>
                    </div>
                </div>`;
        });

        // 3. Resolvemos todas las promesas antes de renderizar
        const productosHtml = await Promise.all(promesasProductos);
        
        // 4. Insertamos el HTML final
        catalog.innerHTML = productosHtml.join('');

    } catch (e) { 
        console.error("Error en la busqueda:", e); 
    }
}


async function cargarImagenURL(keyimagen){
    const res = await fetch(`/files/${keyimagen}`);
    const data = await res.json();
    return data.url;
}

