import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import mongoose from 'mongoose'; 
import './configuracion/oaut.js';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import fileUpload from 'express-fileupload';
import { uploadFile, getFiles, getFile, downloadFile, getFileURL } from './public/s3.js';
import {DATABASE, PORT} from './public/config.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// LOG DE DEPURACIÓN 
console.log("Tipo de MercadoPagoConfig:", typeof MercadoPagoConfig); 

let mpClient;

try {
    mpClient = new MercadoPagoConfig({
        accessToken: process.env.MP_ACCESS_TOKEN
    });
    console.log("--- ¡ÉXITO! mpClient inicializado correctamente ---");
} catch (error) {
    console.error("--- ERROR AL INICIALIZAR MP: ---", error.message);
}

const app = express();
const port = PORT;


// --- CONEXIÓN A MONGODB ---
//const uri = DATABASE;
/*
const uri = 'mongodb+srv://al061914_db_user:prUZyfz5aRiGK3kO@clusterfunkohunter.o2pcqmu.mongodb.net/?appName=ClusterFunkoHunter';
mongoose.connect(uri, {
}).then(() => {
    console.log("Conexión a MongoDB exitosa");

}).catch((error) => {
    console.error("Error al conectar a MongoDB:", error.message);
});*/

const url = DATABASE;

 mongoose.connect(url)
    .then(() => console.log("¡Conectado a MongoDB Compass!"))
    .catch(err => console.error("Error al conectar a Mongo:", err));


// --- DEFINICIÓN DE MODELOS (Tus nuevas "Carpetas") ---,

// Modelo de Producto
const funkoSchema = new mongoose.Schema({
    titulo: String,
    descripcion: String,
    precio: Number,
    cantidad: Number,
    imagen: String
});
const Funko = mongoose.model('productos_funko', funkoSchema);

// Modelo de Usuario (CON CARRITO EMBEBIDO)
const usuarioSchema = new mongoose.Schema({
    nombre: String,
    email: String,
    googleId: String,
    foto: String,
    // Rol del usuario: 'cliente' (default) o 'admin'.
    // Se asigna automáticamente al loguearse, comparando el email contra
    // la lista ADMIN_EMAILS del .env (separados por coma).
    rol: { type: String, enum: ['cliente', 'admin'], default: 'cliente' },
    fecha: { type: Date, default: Date.now },
    // Aquí vive el carrito, ya no necesitas la tabla 'carrito_compra'
    carrito: [
        {
            producto_id: { type: mongoose.Schema.Types.ObjectId, ref: 'productos_funko' },
            titulo: String,
            cantidad: Number
        }
    ]
});
export const Usuario = mongoose.model('users', usuarioSchema);

// Modelo de Compras
const compraSchema = new mongoose.Schema({
    status: String,                     // 'Pendiente' | 'Completado' | 'Fallido'
    productos: Array,                   // array de IDs de Funko (strings)
    cantidades: Array,                  // array paralelo de cantidades (strings o números)
    total: Number,                      // total pagado (incluye envío)
    subtotal: Number,                   // subtotal sin envío
    envio: Number,                      // costo de envío
    usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
    mp_payment_id: String,              // id del pago en Mercado Pago
    mp_preference_id: String,           // id de la preferencia de MP
    fecha: { type: Date, default: Date.now }
});
const Compra = mongoose.model('compras', compraSchema);


app.use(cors());
app.use(express.json());
app.use(express.static('public'));
//app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'secreto_funko_hunter',
    resave: false,
    saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(fileUpload({
    useTempFiles: true,
    tempFileDir: './uploads'
}));



app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'Index.html'));
}); 


// 1. Ruta para iniciar el inicio de sesión con Google
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// 2. Ruta de callback (a donde Google redirige al usuario)
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    // Si llegamos aquí, la autenticación fue exitosa
    console.log("Usuario autenticado:", req.user.nombre);
    // Redirigimos a la página principal de tu tienda
    res.redirect('/Client.html'); 
  }
);


// --- RUTA PARA SABER QUIÉN ESTÁ LOGUEADO ---
app.get('/auth/whoami', (req, res) => {
    // Si Passport verificó al usuario, los datos están en req.user
    if (req.isAuthenticated()) {
        res.json(req.user); 
    } else {
        // Si no hay nadie logueado, mandamos un error 401
        res.status(401).json({ logged: false, message: "No hay sesión activa" });
    }
});

// ============================================================
// MIDDLEWARES DE PERMISOS
// ============================================================

/**
 * Bloquea la ruta si no hay sesión activa.
 */
function requireAuth(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) return next();
    return res.status(401).json({ error: "Debes iniciar sesión" });
}

/**
 * Bloquea la ruta si el usuario no tiene rol 'admin'.
 * Se usa en TODAS las rutas /admin/* del backend.
 */
function requireAdmin(req, res, next) {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: "Debes iniciar sesión" });
    }
    if (req.user.rol !== 'admin') {
        console.warn(`Usuario ${req.user.email} intentó acceder a ruta admin sin permisos`);
        return res.status(403).json({ error: "No tienes permisos de administrador" });
    }
    next();
}

// 3. Ruta para verificar el estado de la sesión (quién está conectado)
app.get('/api/current_user', (req, res) => {
    if (req.isAuthenticated()) {
        // Enviamos los datos del usuario y su carrito integrado
        res.json({
            logged: true,
            user: {
                id: req.user._id,
                nombre: req.user.nombre,
                email: req.user.email,
                foto: req.user.foto,
                carrito: req.user.carrito || []
            }
        });
    } else {
        res.json({ logged: false });
    }
});

// 4. Ruta para cerrar sesión
app.get('/auth/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/');
    });
});

// --- RUTAS ACTUALIZADAS ---

// 1. Obtener productos (Antes era SELECT * FROM...)
app.get("/productos", async (req, res) => {
    try {
        const result = await Funko.find().sort({ _id: 1 });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: "Error en MongoDB" });
    }
});

// 2. Búsqueda Inteligente (Reemplaza similarity de Postgres)
app.get("/Retorno", async (req, res) => {
    const ValorStorage = req.query.FunkitoBuscadito || "";
    try {
        // MongoDB usa Regex para búsquedas tipo "ILIKE"
        const result = await Funko.find({
            titulo: { $regex: ValorStorage, $options: "i" }
        }).limit(20);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: "Error en el buscador" });
    }
});

// ============================================================
// FLUJO DE PAGO CON GUARDADO EN MONGODB
// ============================================================
// Paso 1: El front llama a POST /pago/iniciar
//   -> Creamos una Compra con status 'Pendiente' en Mongo
//   -> Creamos una preferencia en MP con external_reference = _id de la compra
//   -> Devolvemos la URL de MP al front
//
// Paso 2: Usuario paga en MP
//
// Paso 3: MP redirige al usuario según el resultado:
//   -> GET /pago/exitoso  => actualizamos la compra a 'Completado', descontamos stock
//   -> GET /pago/fallido  => actualizamos la compra a 'Fallido'
//   -> GET /pago/pendiente => dejamos en 'Pendiente'
//
// En TODOS los casos, usamos external_reference (el _id de la compra) para
// saber qué compra actualizar.
// ============================================================

app.post("/pago/iniciar", async (req, res) => {
    const { items, envio } = req.body;

    // Requiere sesión activa para asociar la compra al usuario
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Debes iniciar sesión para pagar" });
    }

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "No hay productos para procesar" });
    }

    try {
        // 1. Cargar productos reales desde la BD (nunca confiar en el precio del front)
        const ids = items.map(p => p.id);
        const productosDB = await Funko.find({ _id: { $in: ids } });

        const itemsMP = [];
        const productosCompra = [];  // para guardar en la compra
        const cantidadesCompra = []; // array paralelo
        let subtotal = 0;

        for (const itemFront of items) {
            const productoDB = productosDB.find(p => p._id.toString() === String(itemFront.id));
            if (!productoDB) {
                return res.status(400).json({ error: `Producto ${itemFront.id} no encontrado` });
            }

            const qty = parseInt(itemFront.qty || itemFront.cantidad || 1);

            // Validar stock
            if (qty > productoDB.cantidad) {
                return res.status(400).json({
                    error: `Stock insuficiente de ${productoDB.titulo} (disponibles: ${productoDB.cantidad})`
                });pre
            }

            itemsMP.push({
                title: productoDB.titulo,
                quantity: qty,
                unit_price: Number(productoDB.precio.toFixed(2)),
                currency_id: 'MXN'
            });

            productosCompra.push({
                titulo: productoDB.titulo,
                cantidad: parseInt(qty),
                precio: Number(productoDB.precio.toFixed(2)),
                imagen: productoDB.imagen
            });
            cantidadesCompra.push(String(qty));
            subtotal += productoDB.precio * qty;
        }

        const costoEnvio = Number(envio) || 0;
        const totalFinal = Number((subtotal + costoEnvio).toFixed(2));

        if (costoEnvio > 0) {
            itemsMP.push({
                title: 'Costo de envío',
                quantity: 1,
                unit_price: Number(costoEnvio.toFixed(2)),
                currency_id: 'MXN'
            });
        }

        // 2. Guardar la compra como PENDIENTE en Mongo
        const nuevaCompra = new Compra({
            status: 'Pendiente',
            productos: productosCompra,
            cantidades: cantidadesCompra,
            subtotal: Number(subtotal.toFixed(2)),
            envio: costoEnvio,
            total: totalFinal,
            usuario_id: req.user._id
        });
        await nuevaCompra.save();

        console.log(`Compra ${nuevaCompra._id} creada como Pendiente para el usuario ${req.user._id}`);

        // 3. Crear preferencia en MP con external_reference = id de la compra
        const preference = new Preference(mpClient);
        const resultado = await preference.create({
            body: {
                items: itemsMP,
                external_reference: String(nuevaCompra._id),
                back_urls: {
                    success: `http://localhost:${port}/pago/exitoso`,
                    failure: `http://localhost:${port}/pago/fallido`,
                    pending: `http://localhost:${port}/pago/pendiente`
                }
            }
        });

        // Guardar el preference_id en la compra por si acaso
        nuevaCompra.mp_preference_id = resultado.id;
        await nuevaCompra.save();

        res.json({
            url: resultado.init_point,
            idCompra: String(nuevaCompra._id)
        });

    } catch (error) {
        console.error("Error al iniciar pago:", error);
        res.status(500).json({ error: "Error al procesar el pago", detalle: error.message });
    }
});


// ALIAS: mantiene compatibilidad con el front viejo que llamaba /crear-pago
app.post("/crear-pago", (req, res, next) => {
    // Reenvía la petición al endpoint nuevo
    req.url = '/pago/iniciar';
    app._router.handle(req, res, next);
});


/**
 * Callback de Mercado Pago al APROBAR el pago.
 * MP envía en query: payment_id, status, external_reference, merchant_order_id, etc.
 */
app.get("/pago/exitoso", async (req, res) => {
    const { payment_id, status, external_reference } = req.query;
    console.log("Callback éxito MP:", req.query);

    try {
        // external_reference es el _id de nuestra compra
        if (!external_reference) {
            return res.redirect('/pago-resultado.html?ok=false&motivo=sin_referencia');
        }

        // 1. Buscar la compra en Mongo
        const compra = await Compra.findById(external_reference);
        if (!compra) {
            return res.redirect('/pago-resultado.html?ok=false&motivo=compra_no_encontrada');
        }

        // Si ya está completada, no la procesamos de nuevo (caso "duplicado")
        if (compra.status === 'Completado') {
            return res.redirect(
                `/pago-resultado.html?ok=true&compra=${compra._id}&duplicado=true`
            );
        }

        // 2. Verificar con MP que el pago realmente fue aprobado
        //    (nunca confiar solo en los query params — cualquiera puede entrar manualmente)
        let pagoMP = null;
        if (payment_id) {
            try {
                const mpPayment = new Payment(mpClient);
                pagoMP = await mpPayment.get({ id: payment_id });
                console.log("Pago MP verificado, status:", pagoMP.status);
            } catch (err) {
                console.warn("No se pudo verificar el pago con MP:", err.message);
            }
        }

        // 3. Si MP confirma que está aprobado, actualizamos
        const aprobado = pagoMP ? pagoMP.status === 'approved' : (status === 'approved');

        if (!aprobado) {
            compra.status = 'Fallido';
            await compra.save();
            return res.redirect(
                `/pago-resultado.html?ok=false&motivo=no_aprobado&compra=${compra._id}`
            );
        }

        // 4. Descontar stock de cada producto comprado
        for (let i = 0; i < compra.productos.length; i++) {
            const idProd = compra.productos[i];
            const qty = parseInt(compra.cantidades[i]) || 0;
            // Descontamos de forma atómica (sin condiciones de carrera)
            const actualizado = await Funko.findOneAndUpdate(
                { _id: idProd, cantidad: { $gte: qty } },
                { $inc: { cantidad: -qty } },
                { new: true }
            );
            if (!actualizado) {
                console.warn(`No se pudo descontar stock del producto ${idProd} (puede que ya no haya)`);
            }
        }

        // 5. Vaciar el carrito del usuario
        await Usuario.findByIdAndUpdate(compra.usuario_id, { $set: { carrito: [] } });

        // 6. Marcar compra como completada y guardar el payment_id
        compra.status = 'Completado';
        if (payment_id) compra.mp_payment_id = String(payment_id);
        await compra.save();

        console.log(`Compra ${compra._id} marcada como Completado`);

        return res.redirect(`/pago-resultado.html?ok=true&compra=${compra._id}`);

    } catch (error) {
        console.error("Error al procesar pago exitoso:", error);
        return res.redirect('/pago-resultado.html?ok=false&motivo=error_servidor');
    }
});


/**
 * Callback de MP cuando el pago es RECHAZADO.
 */
app.get("/pago/fallido", async (req, res) => {
    const { external_reference } = req.query;
    console.log("Callback fallido MP:", req.query);

    try {
        if (external_reference) {
            const compra = await Compra.findById(external_reference);
            if (compra && compra.status === 'Pendiente') {
                compra.status = 'Fallido';
                await compra.save();
                console.log(`Compra ${compra._id} marcada como Fallido`);
            }
            return res.redirect(
                `/pago-resultado.html?ok=false&motivo=pago_rechazado&compra=${external_reference}`
            );
        }
        return res.redirect('/pago-resultado.html?ok=false&motivo=pago_rechazado');
    } catch (error) {
        console.error("Error al marcar compra fallida:", error);
        return res.redirect('/pago-resultado.html?ok=false&motivo=error_servidor');
    }
});


/**
 * Callback de MP cuando el pago queda PENDIENTE (p.ej. pago en efectivo).
 */
app.get("/pago/pendiente", async (req, res) => {
    const { external_reference } = req.query;
    console.log("Callback pendiente MP:", req.query);

    // No cambiamos el status (ya está 'Pendiente')
    return res.redirect(
        `/pago-resultado.html?ok=pending&compra=${external_reference || ''}`
    );
});

app.post("/carrito/detalle", async (req, res) => {
    const { items } = req.body || {};
    
    if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Formato inválido: se esperaba un array de items" });
    }

    try {
        const detalle = [];
        let total = 0;
        const advertencias = [];

        for (const item of items) {
            // Buscamos usando el modelo basado en tu funkoSchema
            // Asumo que tu modelo se llama 'Funko'
            const p = await Funko.findById(item.id);

            if (!p) {
                advertencias.push(`El Funko con ID ${item.id} ya no está disponible en nuestro catálogo`);
                continue;
            }

            // Mapeamos los campos según tu esquema: precio y cantidad (stock)
            const cantSolicitada = Number(item.qty || item.cantidad) || 0;
            const subtotal = p.precio * cantSolicitada;
            total += subtotal;

            detalle.push({
                id: p._id,
                titulo: p.titulo,
                precio_unitario: p.precio,
                cantidad: cantSolicitada,
                subtotal: Number(subtotal.toFixed(2)),
                imagen: p.imagen, // Agregamos la imagen de tu esquema
                stock_disponible: p.cantidad, // 'p.cantidad' en tu esquema es el stock
                stock_ok: cantSolicitada <= p.cantidad
            });

            // Si el usuario pide más de lo que hay en 'cantidad' (stock)
            if (cantSolicitada > p.cantidad) {
                advertencias.push(`${p.titulo}: Solo quedan ${p.cantidad} unidades disponibles.`);
            }
        }

        res.json({
            items: detalle,
            total: Number(total.toFixed(2)),
            advertencias
        });

    } catch (error) {
        console.error("Error en detalle carrito:", error);
        res.status(500).json({ error: "Error interno", mensaje: error.message });
    }
});

// En Server.js
app.get("/productos/:id", async (req, res) => {
    try {
        // findById busca automáticamente usando el string de hexágonos de Mongo
        const producto = await Funko.findById(req.params.id);
        res.json(producto);
    } catch (error) {
        res.status(404).json({ error: "Producto no encontrado" });
    }
});

// 3. Cargar Carrito (¡YA NO NECESITA INNER JOIN!)
app.get("/CargarCarrito/:id", async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "No logueado" });
    }

    try {
        const userId = req.params.id; // id recibido en la URL
        const usuario = await Usuario.findById(userId, { carrito: 1, _id: 0 });

        if (!usuario) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        res.json(usuario.carrito || []);
    } catch (error) {
        console.error("Error al cargar carrito:", error);
        res.status(500).json({ error: "Error interno al cargar carrito" });
    }
});


// 4. Actualizar Carrito (Mucho más simple)
app.post("/ActualizarCarritoDB", async (req, res) => {
    const { items, idUsuario } = req.body; 

    // Validamos que lleguen los datos necesarios
    if (!idUsuario || !Array.isArray(items)) {
        return res.status(400).json({ error: "Datos insuficientes o formato inválido" });
    }

    // Mapeamos para que coincida EXACTAMENTE con tu esquema de carrito en Mongoose
    const itemsNormalizados = items.map(i => ({
        producto_id: i.id,    // En tu esquema es 'producto_id'
        titulo: i.titulo,      
        cantidad: Number(i.qty || i.cantidad), // Mapeamos 'qty' a 'cantidad'
    }));

    try {
        const usuario = await Usuario.findByIdAndUpdate(
            idUsuario, 
            { $set: { carrito: itemsNormalizados } }, 
            { new: true, runValidators: true } // runValidators asegura que el esquema se respete
        );

        if (!usuario) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }

        res.json(usuario.carrito);
    } catch (error) {
        console.error("Error al actualizar carrito en DB:", error);
        res.status(500).json({ error: "Error al guardar carrito", detalle: error.message });
    }
});

// 5. Obtener las compras del usuario logueado
// Devuelve las compras ordenadas de más reciente a más antigua,
// con los datos embebidos de cada producto para no tener que hacer
// fetch adicionales desde el front.
app.get("/MisCompras", async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "No logueado" });
    }

    try {
        const compras = await Compra.find({ usuario_id: req.user._id })
            .sort({ fecha: -1 });

        // Enriquecemos cada compra con los datos de sus productos
        // (título, imagen, precio) para que el front los pueda mostrar directo.
        const comprasConDetalle = await Promise.all(compras.map(async (compra) => {
            return {
                _id: compra._id,
                status: compra.status,
                total: compra.total,
                subtotal: compra.subtotal,
                envio: compra.envio,
                fecha: compra.fecha,
                mp_payment_id: compra.mp_payment_id,
                productos: compra.productos
            };
        }));

        res.json(comprasConDetalle);
    } catch (error) {
        console.error("Error al cargar compras del usuario:", error);
        res.status(500).json({ error: "Error al cargar las compras" });
    }
});


// Alias viejo para que el código que aún use /GuardarCompra no rompa.
// IMPORTANTE: este endpoint ya no se debe usar desde el front — el guardado
// ahora lo hace automáticamente el callback /pago/exitoso.
app.post("/GuardarCompra", async (req, res) => {
    const { Status, Productos, Cantidades, Total, id } = req.body;
    try {
        const nuevaCompra = new Compra({
            status: Status,
            productos: Productos,
            cantidades: Cantidades,
            total: Total,
            usuario_id: id
        });
        await nuevaCompra.save();
        res.status(201).json(nuevaCompra);
    } catch (error) {
        res.status(500).json({ error: "Error al guardar compra" });
    }
});


// ============================================================
// ENDPOINTS DE ADMIN
// ============================================================
// Todos los endpoints aquí pasan por requireAdmin, así que están
// protegidos a nivel backend (no basta con esconder el botón en el front).
// ============================================================

// --- PRODUCTOS ---

/**
 * GET /admin/productos
 * Lista TODOS los productos (sin filtrar agotados ni nada).
 */
app.get("/admin/productos", requireAdmin, async (req, res) => {
    try {
        const productos = await Funko.find().sort({ titulo: 1 });
        res.json(productos);
    } catch (error) {
        console.error("Error al listar productos (admin):", error);
        res.status(500).json({ error: "Error en la base de datos" });
    }
});

/**
 * POST /admin/productos
 * Crea un nuevo Funko. Body: { titulo, precio, cantidad, descripcion, imagen }
 */
app.post("/admin/productos", requireAdmin, async (req, res) => {
    const { titulo, precio, cantidad, descripcion, imagen } = req.body;
    try {
        if (!titulo || precio == null || cantidad == null) {
            return res.status(400).json({ error: "titulo, precio y cantidad son obligatorios" });
        }
        const nuevo = new Funko({
            titulo,
            precio: Number(precio),
            cantidad: parseInt(cantidad),
            descripcion: descripcion || '',
            imagen: imagen || ''
        });
        await nuevo.save();
        console.log(`[Admin ${req.user.email}] Creó producto: ${titulo}`);
        res.status(201).json(nuevo);
    } catch (error) {
        console.error("Error al crear producto:", error);
        res.status(500).json({ error: "No se pudo crear el producto", detalle: error.message });
    }
});

/**
 * PUT /admin/productos/:id
 * Actualiza un Funko. Body: { titulo, precio, cantidad, descripcion, imagen }
 */
app.put("/admin/productos/:id", requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { titulo, precio, cantidad, descripcion, imagen } = req.body;
    try {
        const cambios = {};
        if (titulo !== undefined) cambios.titulo = titulo;
        if (precio !== undefined) cambios.precio = Number(precio);
        if (cantidad !== undefined) cambios.cantidad = parseInt(cantidad);
        if (descripcion !== undefined) cambios.descripcion = descripcion;
        if (imagen !== undefined) cambios.imagen = imagen;

        const actualizado = await Funko.findByIdAndUpdate(id, cambios, { new: true });
        if (!actualizado) return res.status(404).json({ error: "Producto no encontrado" });

        console.log(`[Admin ${req.user.email}] Editó producto ${id}`);
        res.json(actualizado);
    } catch (error) {
        console.error("Error al editar producto:", error);
        res.status(500).json({ error: "No se pudo editar el producto", detalle: error.message });
    }
});

/**
 * DELETE /admin/productos/:id
 * Elimina un Funko de la BD.
 */

app.delete("/admin/productos/:id", requireAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        // 1. Validar que el ID sea un ObjectId válido antes de operar
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: "ID de producto no válido" });
        }

        // 2. Eliminar el producto de la colección Funkos
        const eliminado = await Funko.findByIdAndDelete(id);
        
        if (!eliminado) {
            return res.status(404).json({ error: "Producto no encontrado" });
        }

        // 3. Limpiar carritos de TODOS los usuarios
        // Convertimos el id (String) a ObjectId para asegurar que el $pull coincida
        const objectId = new mongoose.Types.ObjectId(id);

        const resultadoLimpieza = await Usuario.updateMany(
            { "carrito.producto_id": objectId }, 
            { 
                $pull: { 
                    carrito: { producto_id: objectId } 
                } 
            }
        );

        console.log(`[Admin ${req.user.email}] Eliminó producto: ${eliminado.titulo}`);
        console.log(`Se removió de ${resultadoLimpieza.modifiedCount} carritos.`);

        res.json({ 
            ok: true, 
            mensaje: "Producto eliminado y carritos actualizados",
            eliminado 
        });

    } catch (error) {
        console.error("Error al eliminar producto:", error);
        res.status(500).json({ error: "No se pudo eliminar el producto" });
    }
});

// --- COMPRAS ---

/**
 * GET /admin/compras
 * Lista TODAS las compras de TODOS los usuarios (con datos de usuario y productos enriquecidos).
 * Soporta filtros opcionales por query string:
 *   ?status=Completado | Pendiente | Fallido
 */
app.get("/admin/compras", requireAdmin, async (req, res) => {
    try {
        let productosCompra = [];
        const filtro = {};
        if (req.query.status) filtro.status = req.query.status;

        // Populate trae los datos del usuario asociado a cada compra
        const compras = await Compra.find(filtro)
            .populate('usuario_id', 'nombre email foto')
            .sort({ fecha: -1 });

        // Enriquecemos los productos con título e imagen
        const enriquecidas = await Promise.all(compras.map(async (c) => {

            return {
                _id: c._id,
                status: c.status,
                total: c.total,
                subtotal: c.subtotal,
                envio: c.envio,
                fecha: c.fecha,
                mp_payment_id: c.mp_payment_id,
                usuario: c.usuario_id ? {
                    nombre: c.usuario_id.nombre,
                    email: c.usuario_id.email,
                    foto: c.usuario_id.foto
                } : null,
                productos: c.productos
            };
        }));

        res.json(enriquecidas);
    } catch (error) {
        console.error("Error al listar compras (admin):", error);
        res.status(500).json({ error: "Error al cargar compras" });
    }
});

/**
 * GET /admin/stats
 * Devuelve un resumen útil para el dashboard del admin.
 */
app.get("/admin/stats", requireAdmin, async (req, res) => {
    try {
        const [totalProductos, totalCompras, comprasCompletadas, agotados] = await Promise.all([
            Funko.countDocuments(),
            Compra.countDocuments(),
            Compra.countDocuments({ status: 'Completado' }),
            Funko.countDocuments({ cantidad: 0 })
        ]);

        // Suma de ventas (solo de compras completadas)
        const ventasAgg = await Compra.aggregate([
            { $match: { status: 'Completado' } },
            { $group: { _id: null, total: { $sum: '$total' } } }
        ]);
        const ventasTotales = ventasAgg.length > 0 ? ventasAgg[0].total : 0;

        res.json({
            totalProductos,
            totalCompras,
            comprasCompletadas,
            productosAgotados: agotados,
            ventasTotales: Number(ventasTotales.toFixed(2))
        });
    } catch (error) {
        console.error("Error al obtener stats:", error);
        res.status(500).json({ error: "Error al obtener estadísticas" });
    }
});


//Seccion manejo de fotos con S3
app.post("/files", async (req, res)=>{
    //const result = await uploadFile(req.files.file);
    //await uploadFile(req.files.file);  
    //res.json({message: "Archivo subido correctamente"});
    //res.json({result});
    const archivo = req.files.file;
    await uploadFile(archivo);
    res.json({ message: "Archivo subido correctamente", key: archivo.name });

});


//Lista con todos los objetos almacenados en S3
app.get('/files', async (req, res) =>{
    const result = await getFiles();
    res.json(result.Contents)

})

//Octa Avion aqui podeos buscar un solo objeto almacenado en S3
/*app.get('/files/:fileName', async (req, res) =>{
    const result = await getFile(req.params.fileName);
    //res.send('Key solicitada recibida')
    res.json(result.$metadata)

})*/


app.get('/downloadfile/:fileName', async (req, res) =>{
    await downloadFile(req.params.fileName);
    res.json({message: "Archivo descargado correctamente"});

})


app.get('/files/:fileName', async (req, res) =>{
    const result = await getFileURL(req.params.fileName);
    console.log("key solicitada:", req.params.fileName);
    //res.send('Key solicitada recibida')
    res.json({
        url: result
    })

})



app.use(express.static('images'));


app.listen(port, async () => {
  console.log("Esperando peticiones", port); 
});


//app.listen(port, () => console.log(`Servidor en http://localhost:${port}`));
