let idUser; 
let carrito; 
let TotalGLOB; 
document.addEventListener('DOMContentLoaded', () => {
    const homeIcon = document.getElementById('home-icon');

    if (homeIcon) homeIcon.onclick = () => window.location.href = 'Client.html';

    checkAuth();

    // Al cargar la página de pago
    
});

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
                await cargarResumenCheckout()
                console.log("carrito", carrito); 
            }
        }
    } catch (error) {
        console.log("Sesión no iniciada", error);
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


// Uso: buscar el producto con ID 10
// obtenerDetallesProducto(10);


// Uso: Si el Funko con ID 5 ahora tiene 10 unidades
// actualizarInventario(5, 10);



// Llamar a la función, por ejemplo, al hacer clic en un botón
// guardarVenta();

async function cargarResumenCheckout() {
    const contenedor = document.getElementById('lista-checkout');
    if (!contenedor) return;

    if (!carrito || carrito.length === 0) {
        contenedor.innerHTML = `
            <div style="padding:2rem; text-align:center; color:#666;">
                <i class="bi bi-bag-x" style="font-size:2rem;"></i>
                <p style="margin-top:1rem;">Tu carrito está vacío</p>
                <a href="Client.html" style="color:#111; text-decoration:underline;">Volver al catálogo</a>
            </div>
        `;
        actualizarTotalesPagoConServer(0);
        const btn = document.querySelector('.btn-terminar-compra');
        if (btn) btn.disabled = true;
        return;
    }

    contenedor.innerHTML = '';

    try {
        // Pedimos al servidor el detalle de TODO el carrito (incluye títulos y precios reales)
        const itemsParaServer = carrito.map(i => ({ id: i.id, cantidad: i.qty }));
        const res = await fetch('/carrito/detalle', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ items: itemsParaServer })
        });

        if (!res.ok) {
            contenedor.innerHTML = `<p style="color:#c00; padding:2rem;">Error al validar el carrito.</p>`;
            return;
        }

        const data = await res.json();

        // Si hay advertencias de stock, las mostramos arriba
        if (data.advertencias && data.advertencias.length > 0) {
            contenedor.innerHTML += `
                <div style="background:#fff3cd; border-left:4px solid #f39c12; padding:12px 16px; margin-bottom:12px; border-radius:6px;">
                    <strong>Atención:</strong>
                    <ul style="margin:6px 0 0 20px;">
                        ${data.advertencias.map(a => `<li>${a}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        // Pintamos cada item con los datos del servidor
        for (const item of data.items) {
            const imgSrc = await cargarImagenURL(item.imagen);
            contenedor.innerHTML += `
                <div class="cart-item">
                    <div class="col-article item-details">
                        <img src="${imgSrc}" alt="${item.titulo}" class="item-img"
                             onerror="this.src='https://via.placeholder.com/80x80/f8f8f8/333?text=Funko'">
                        <div class="item-info">
                            <h3>${item.titulo}</h3>
                            <p>$${item.precio_unitario.toFixed(2)} c/u</p>
                        </div>
                    </div>
                    <div class="col-qty" style="text-align: center;">
                        <span style="font-weight: 600; font-size: 1.1rem;">${item.cantidad}</span>
                    </div>
                    <div class="col-price item-total-price">
                        $${item.subtotal.toLocaleString('es-MX', {minimumFractionDigits: 2})}
                    </div>
                </div>
            `;
        }

        actualizarTotalesPagoConServer(data.total);

    } catch (error) {
        console.error("Error al cargar resumen del checkout:", error);
        contenedor.innerHTML = `<p style="color:#c00; padding:2rem;">No se pudo cargar el carrito.</p>`;
    }
}

// Constante del costo de envío (para mantenerlo consistente entre UI y MP)
const COSTO_ENVIO = 40;

function actualizarTotalesPagoConServer(subtotalOficial) {
    const subtotal = parseFloat(subtotalOficial) || 0;
    const envio = subtotal > 0 ? COSTO_ENVIO : 0; // si no hay items, no cobramos envío
    const totalFinal = subtotal + envio;

    // Variable global que usamos al guardar la compra
    TotalGLOB = parseFloat(totalFinal.toFixed(2));
    console.log("Subtotal:", subtotal, "Envío:", envio, "Total final:", TotalGLOB);

    const subtotalEl = document.getElementById('resumen-subtotal');
    const envioEl = document.getElementById('resumen-envio');
    const totalEl = document.getElementById('resumen-total');

    if (subtotalEl) subtotalEl.textContent = `$${subtotal.toLocaleString('es-MX', {minimumFractionDigits: 2})}`;
    if (envioEl) envioEl.textContent = `$${envio.toLocaleString('es-MX', {minimumFractionDigits: 2})}`;
    if (totalEl) totalEl.textContent = `$${totalFinal.toLocaleString('es-MX', {minimumFractionDigits: 2})}`;
}


// --- PAGO CON MERCADO PAGO ---
async function procesarPago() {
    if (!carrito || carrito.length === 0) {
        alert('Tu carrito está vacío');
        return;
    }

    const btn = document.querySelector('.btn-terminar-compra');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Procesando...';
    }

    try {
        // Llamamos al NUEVO endpoint /pago/iniciar.
        // El servidor va a:
        //   1. Crear una compra "Pendiente" en Mongo
        //   2. Crear la preferencia de MP con external_reference = _id de la compra
        //   3. Devolver la URL de MP
        const response = await fetch('/pago/iniciar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: carrito,
                envio: COSTO_ENVIO
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Error al crear el pago');
        }

        const { url, idCompra } = await response.json();
        console.log(`Compra Pendiente creada (${idCompra}). Redirigiendo a MP...`);

        // Guardamos el id por si queremos verificarla al regresar
        localStorage.setItem('ultimaCompraPendiente', idCompra);

        window.location.href = url;

    } catch (error) {
        console.error('Error al procesar el pago:', error);
        alert('Hubo un error al iniciar el pago: ' + error.message);

        if (btn) {
            btn.disabled = false;
            btn.textContent = 'TERMINAR COMPRA';
        }
    }
}

//GUARDAR INFO EN L


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



