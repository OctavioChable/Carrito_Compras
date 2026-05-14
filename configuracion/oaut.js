import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
// Importamos el modelo de Usuario que definimos en Server.js
// Asegúrate de exportarlo en Server.js o tenerlo en un archivo separado de Models
import { Usuario } from '../Server.js'; 

passport.serializeUser((user, done) => {
    // MongoDB usa _id (con guion bajo)
    done(null, user._id); 
});

passport.deserializeUser(async (id, done) => {
    try {
        // Buscamos por ID en MongoDB
        const usuario = await Usuario.findById(id);
        done(null, usuario);
    } catch (err) {
        done(err);
    }
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    const { id, displayName, emails, photos } = profile;
    const email = emails[0].value;
    const foto = photos[0].value;

    // Lista blanca de admins desde el .env (ej: ADMIN_EMAILS=rafa@gmail.com,otro@gmail.com)
    // La normalizamos en minúsculas y sin espacios para evitar errores tontos.
    const adminEmails = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean);
    const esAdmin = adminEmails.includes(email.toLowerCase());

    try {
        // 1. Buscamos si el Usuario ya existe por su googleId
        let usuario = await Usuario.findOne({ googleId: id });

        if (usuario) {
            // Caso A: ya existe.
            // Sincronizamos el rol por si lo agregaste/quitaste del .env después
            // de su primer login (así no tienes que tocar Mongo a mano).
            const nuevoRol = esAdmin ? 'admin' : 'cliente';
            if (usuario.rol !== nuevoRol) {
                usuario.rol = nuevoRol;
                await usuario.save();
                console.log(`Rol del usuario ${usuario.nombre} actualizado a ${nuevoRol}`);
            }
            console.log("Usuario existente:", usuario.nombre, "| rol:", usuario.rol);
            return done(null, usuario);
        } else {
            // Caso B: Nuevo Usuario.
            // Le asignamos el rol según ADMIN_EMAILS desde el inicio.
            const nuevoUsuario = new Usuario({
                googleId: id,
                nombre: displayName,
                email: email,
                foto: foto,
                rol: esAdmin ? 'admin' : 'cliente',
                carrito: []
            });

            await nuevoUsuario.save();
            console.log(
                `Nuevo usuario creado: ${displayName} | rol: ${nuevoUsuario.rol}`
            );
            return done(null, nuevoUsuario);
        }
    } catch (err) {
        console.error("Error en la estrategia de Google:", err);
        return done(err);
    }
  }
));