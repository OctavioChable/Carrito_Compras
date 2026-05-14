/**
 * admin.js — Lógica del panel de administración.
 *
 * Funcionalidad:
 *   - Verifica que el usuario sea admin (sino, redirige al inicio)
 *   - Dashboard de estadísticas
 *   - CRUD de productos
 *   - Listado y filtrado de todas las compras
 */

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    const esAdmin = await verificarAdmin();
    if (!esAdmin) return; // verificarAdmin ya redirigió

    document.getElementById('tab-productos').style.display = 'block';
    await cargarStats();
    await cargarProductos();
    //await cargarImagenProducto("Captura de pantalla (1).png")
    //await cargarImagenPrueba2();
    // Las compras se cargan cuando el usuario abre la pestaña
});


// --- VERIFICACIÓN DE PERMISOS ---

async function verificarAdmin() {
    try {
        const res = await fetch('/auth/whoami');
        if (!res.ok) {
            alert('Debes iniciar sesión.');
            window.location.href = 'Client.html';
            return false;
        }
        const user = await res.json();
        if (user.rol !== 'admin') {
            alert('No tienes permisos de administrador.');
            window.location.href = 'Client.html';
            return false;
        }

        // Mostrar el nombre del admin en el header
        const span = document.getElementById('admin-name');
        if (span) span.textContent = user.email;

        return true;
    } catch (error) {
        console.error('Error al verificar admin:', error);
        window.location.href = 'Client.html';
        return false;
    }
}


// --- DASHBOARD STATS ---

async function cargarStats() {
    try {
        const res = await fetch('/admin/stats');
        if (!res.ok) throw new Error('No se pudieron cargar las estadísticas');
        const stats = await res.json();

        const grid = document.getElementById('stats-grid');
        grid.innerHTML = `
            <div class="stat-card blue">
                <div class="stat-label">Productos en catálogo</div>
                <div class="stat-value">${stats.totalProductos}</div>
            </div>
            <div class="stat-card green">
                <div class="stat-label">Compras completadas</div>
                <div class="stat-value">${stats.comprasCompletadas}</div>
            </div>
            <div class="stat-card orange">
                <div class="stat-label">Total de compras</div>
                <div class="stat-value">${stats.totalCompras}</div>
            </div>
            <div class="stat-card red">
                <div class="stat-label">Productos agotados</div>
                <div class="stat-value">${stats.productosAgotados}</div>
            </div>
            <div class="stat-card green">
                <div class="stat-label">Ventas totales</div>
                <div class="stat-value">$${formatearPrecio(stats.ventasTotales)}</div>
            </div>
        `;
    } catch (error) {
        console.error('Error al cargar stats:', error);
    }
}


// --- TABS ---

function cambiarTab(nombre) {
    // Toggle de los tabs
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${nombre}-btn`).classList.add('active');

    // Toggle de los contenidos
    document.getElementById('tab-productos').style.display = nombre === 'productos' ? 'block' : 'none';
    document.getElementById('tab-compras').style.display = nombre === 'compras' ? 'block' : 'none';

    // Cargar datos al abrir compras (lazy)
    if (nombre === 'compras') cargarCompras();
    if (nombre === 'productos') cargarProductos();
}


// --- PRODUCTOS ---

let productosCache = []; // para el botón Editar



async function cargarProductos() {
    console.log("si carga la funcion"); 
    const tbody = document.getElementById('productos-tbody');
    try {
        const res = await fetch('/admin/productos');
        if (!res.ok) throw new Error('Error al cargar');
        const productos = await res.json();
        productosCache = productos;

        console.log("productos numero: ", productos.length, productos)
        if (productos.length === 0) {
            tbody.innerHTML = `
                <tr><td colspan="6" class="empty-state">
                    <i class="bi bi-inbox"></i>
                    No hay productos. ¡Agrega el primero!
                </td></tr>
            `;
            return;
        }

        console.log("antes del mapeo");

        // 1. Creamos el array de promesas usando un map asíncrono
        const filasPromesas = productos.map(async (p) => {
            const agotado = Number(p.cantidad) === 0;
            const stockPill = agotado
                ? '<span class="pill pill-red">Agotado</span>'
                : Number(p.cantidad) < 5
                    ? `<span class="pill pill-orange">Bajo (${p.cantidad})</span>`
                    : `<span class="pill pill-green">${p.cantidad}</span>`;
            
            // 2. Ahora el await esperará correctamente la URL de Cloudinary
            const imgSrc = await cargarImagenURL(p.imagen);
            
            return `
                <tr>
                    <td>
                        <img src="${imgSrc}" alt="${escapeHtml(p.titulo)}" class="img-thumb"
                             onerror="this.src='https://via.placeholder.com/44x44/eee/999?text=F'">
                    </td>
                    <td><strong>${escapeHtml(p.titulo)}</strong></td>
                    <td>$${Number(p.precio).toFixed(2)}</td>
                    <td>${p.cantidad}</td>
                    <td>${stockPill}</td>
                    <td>
                        <button class="btn-admin btn-edit" onclick="editarProducto('${p._id}')">
                            <i class="bi bi-pencil"></i> Editar
                        </button>
                        <button class="btn-admin btn-delete" onclick="eliminarProducto('${p._id}', '${escapeAttr(p.titulo)}')">
                            <i class="bi bi-trash"></i> Eliminar
                        </button>
                    </td>
                </tr>
            `;
        });

        // 3. Esperamos a que todas las filas se generen (se resuelvan las promesas)
        const filasHtml = await Promise.all(filasPromesas);

        // 4. Insertamos el HTML final
        tbody.innerHTML = filasHtml.join('');

        console.log("despues del mapeo");
    } catch (error) {
        console.error('Error al cargar productos:', error);
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Error al cargar</td></tr>`;
    }
}


function abrirModalProducto() {
    document.getElementById('modal-titulo').textContent = 'Nuevo producto';
    document.getElementById('prod-id').value = '';
    document.getElementById('prod-titulo').value = '';
    document.getElementById('prod-precio').value = '';
    document.getElementById('prod-cantidad').value = '';
    document.getElementById('prod-imagen').value = '';
    document.getElementById('prod-descripcion').value = '';
    document.getElementById('modal-producto').classList.add('open');
}

function editarProducto(id) {
    const p = productosCache.find(x => String(x._id) === String(id));
    if (!p) return;

    document.getElementById('modal-titulo').textContent = 'Editar producto';
    document.getElementById('prod-id').value = p._id;
    document.getElementById('prod-titulo').value = p.titulo || '';
    document.getElementById('prod-precio').value = p.precio || '';
    document.getElementById('prod-cantidad').value = p.cantidad || 0;
    document.getElementById('prod-imagen').value = p.imagen || '';
    document.getElementById('prod-descripcion').value = p.descripcion || '';
    document.getElementById('modal-producto').classList.add('open');
}

function cerrarModalProducto() {
    document.getElementById('modal-producto').classList.remove('open');
}


async function guardarProducto() {
    const id = document.getElementById('prod-id').value;
    const fileInput = document.getElementById('file');
    const archivoSeleccionado = fileInput && fileInput.files && fileInput.files[0];

    // Determinar el nombre de imagen
    let nombreImagen = document.getElementById('prod-imagen').value.trim();

    // Si hay archivo seleccionado, subirlo primero al endpoint /files
    if (archivoSeleccionado) {
        try {
            const formData = new FormData();
            formData.append('file', archivoSeleccionado);

            const resUpload = await fetch('/files', {
                method: 'POST',
                body: formData
                // ⚠️ No pongas Content-Type, el navegador lo pone solo con el boundary
            });

            if (!resUpload.ok) {
                const errUpload = await resUpload.json().catch(() => ({}));
                throw new Error(errUpload.error || 'Error al subir la imagen');
            }

            const dataUpload = await resUpload.json();
            // El endpoint devuelve la key/nombre del archivo — ajusta según tu respuesta
            //nombreImagen = dataUpload.key || dataUpload.filename || dataUpload.nombre || archivoSeleccionado.name;
            nombreImagen = dataUpload.key || archivoSeleccionado.name;

        } catch (error) {
            alert('Error al subir imagen: ' + error.message);
            return;
        }
    }

    const payload = {
        titulo: document.getElementById('prod-titulo').value.trim(),
        precio: document.getElementById('prod-precio').value,
        cantidad: document.getElementById('prod-cantidad').value,
        imagen: nombreImagen,
        descripcion: document.getElementById('prod-descripcion').value.trim()
    };

    if (!payload.titulo || payload.precio === '' || payload.cantidad === '') {
        alert('Título, precio y stock son obligatorios.');
        return;
    }

    try {
        const url = id ? `/admin/productos/${id}` : '/admin/productos';
        const method = id ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Error al guardar');
        }

        cerrarModalProducto();
        cargarProductos();
        cargarStats();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}



async function eliminarProducto(id, titulo) {
    if (!confirm(`¿Eliminar "${titulo}"?\nEsta acción no se puede deshacer.`)) return;

    try {
        const res = await fetch(`/admin/productos/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al eliminar');
        cargarProductos();
        cargarStats();
    } catch (error) {
        alert('Error al eliminar: ' + error.message);
    }
}


// --- COMPRAS ---

async function cargarCompras() {
    const tbody = document.getElementById('compras-tbody');
    const status = document.getElementById('filtro-status').value;
    const url = status ? `/admin/compras?status=${status}` : '/admin/compras';

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Error al cargar');
        const compras = await res.json();

        if (compras.length === 0) {
            tbody.innerHTML = `
                <tr><td colspan="6" class="empty-state">
                    <i class="bi bi-receipt"></i>
                    No hay compras${status ? ` con estado "${status}"` : ''}.
                </td></tr>
            `;
            return;
        }

        tbody.innerHTML = compras.map((c, idx) => {
            const shortId = String(c._id).slice(-6).toUpperCase();
            const fecha = c.fecha
                ? new Date(c.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
                : '—';
            const pillClass =
                c.status === 'Completado' ? 'pill-green' :
                c.status === 'Pendiente'  ? 'pill-orange' :
                c.status === 'Fallido'    ? 'pill-red' : 'pill-gray';
            const cliente = c.usuario
                ? `<strong>${escapeHtml(c.usuario.nombre)}</strong><br><small style="color:#999;">${escapeHtml(c.usuario.email)}</small>`
                : '<em style="color:#999;">Usuario eliminado</em>';

            const productosHTML = (c.productos || []).map(p => `
                <li>${escapeHtml(p.titulo)} — Cant: ${p.cantidad} — $${Number(p.precio || 0).toFixed(2)}</li>
            `).join('');

            return `
                <tr class="compra-row expandable" onclick="toggleDetalleCompra(${idx})">
                    <td><strong>#${shortId}</strong></td>
                    <td>${cliente}</td>
                    <td>${fecha}</td>
                    <td>$${Number(c.total).toFixed(2)}</td>
                    <td><span class="pill ${pillClass}">${c.status}</span></td>
                    <td>
                        <i class="bi bi-chevron-down" id="chev-${idx}"></i>
                    </td>
                </tr>
                <tr class="compra-detail-row" id="detalle-${idx}">
                    <td colspan="6">
                        <div class="compra-detail-content">
                            <div style="display:flex; gap:24px; flex-wrap:wrap;">
                                <div>
                                    <strong>Productos:</strong>
                                    <ul>${productosHTML}</ul>
                                </div>
                                <div>
                                    <strong>Resumen:</strong>
                                    <ul style="list-style:none; padding-left:0;">
                                        <li>Subtotal: $${Number(c.subtotal || 0).toFixed(2)}</li>
                                        <li>Envío: $${Number(c.envio || 0).toFixed(2)}</li>
                                        <li><strong>Total: $${Number(c.total).toFixed(2)}</strong></li>
                                        ${c.mp_payment_id ? `<li style="margin-top:6px;"><small>MP Payment ID: <code>${c.mp_payment_id}</code></small></li>` : ''}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Error al cargar compras:', error);
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Error al cargar</td></tr>`;
    }
}

function toggleDetalleCompra(idx) {
    const row = document.getElementById(`detalle-${idx}`);
    const chev = document.getElementById(`chev-${idx}`);
    if (!row) return;

    const open = row.classList.toggle('open');
    if (chev) {
        chev.classList.toggle('bi-chevron-down', !open);
        chev.classList.toggle('bi-chevron-up', open);
    }
}


// --- HELPERS ---

function escapeHtml(t) {
    const div = document.createElement('div');
    div.textContent = t == null ? '' : String(t);
    return div.innerHTML;
}
function escapeAttr(t) {
    return escapeHtml(t).replace(/"/g, '&quot;').replace(/'/g, "\\'");
}
function formatearPrecio(n) {
    return Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
}


/*
async function cargarImagenProducto(keyimagen){
    const res = await fetch(`/files/${keyimagen}`);
    const data = await res.json();
    console.log("data: ", data.url);
    document.getElementById('miImagen').src = data.url;
    return data.url;
}
*/

/*
async function cargarImagenPrueba2(){
    const url = await cargarImagenURL("Captura de pantalla (1).png");
    console.log("URL obtenida de prueba: ", url);
}
*/

async function cargarImagenURL(keyimagen){
    const res = await fetch(`/files/${keyimagen}`);
    const data = await res.json();
    return data.url;
}