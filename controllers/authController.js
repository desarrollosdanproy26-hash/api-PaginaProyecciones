const { getConnection, sql } = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Secret key para JWT (en producción, ponerlo en .env)
const JWT_SECRET = process.env.JWT_SECRET || 'tu_clave_secreta_muy_segura_cambiar_en_produccion';

/**
 * Login de usuario
 */
async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Usuario y contraseña son requeridos' 
      });
    }

    const pool = await getConnection();
    
    // Buscar usuario por UserName (usando columna Roll)
    const result = await pool.request()
      .input('username', sql.NVarChar, username)
      .query(`
        SELECT idUsuario, Nombre, UserName, Clave, Roll, DNI, Abrev 
        FROM Usuario 
        WHERE UserName = @username
      `);

    if (result.recordset.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: 'Usuario o contraseña incorrectos' 
      });
    }

    const user = result.recordset[0];

    // Verificar contraseña
    // Opción 1: Contraseña en texto plano (TEMPORAL - cambiar después)
    const isPasswordValid = password === user.Clave;
    
    // Opción 2: Con bcrypt (descomentar cuando migremos las contraseñas)
    // const isPasswordValid = await bcrypt.compare(password, user.Clave);

    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        error: 'Usuario o contraseña incorrectos' 
      });
    }

    // Crear token JWT
    const token = jwt.sign(
      { 
        idUsuario: user.idUsuario,
        username: user.UserName,
        rol: user.Roll,
        nombre: user.Nombre
      },
      JWT_SECRET,
      { expiresIn: '8h' } // Token válido por 8 horas
    );

    // Enviar respuesta con token y datos del usuario
    res.json({
      success: true,
      message: `¡Bienvenido ${user.Nombre}!`,
      token,
      user: {
        idUsuario: user.idUsuario,
        nombre: user.Nombre,
        username: user.UserName,
        rol: user.Roll,
        abrev: user.Abrev
      }
    });

  } catch (err) {
    console.error('❌ Error en login:', err.message);
    res.status(500).json({ 
      success: false, 
      error: 'Error al iniciar sesión',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

/**
 * Verificar token
 */
async function verifyToken(req, res) {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token no proporcionado' 
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    res.json({
      success: true,
      user: decoded
    });

  } catch (err) {
    res.status(401).json({ 
      success: false, 
      error: 'Token inválido o expirado' 
    });
  }
}

/**
 * Cambiar contraseña
 */
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.idUsuario; // Del middleware de autenticación

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Contraseña actual y nueva son requeridas' 
      });
    }

    const pool = await getConnection();
    
    // Obtener usuario
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`SELECT Clave FROM Usuario WHERE idUsuario = @userId`);

    if (result.recordset.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Usuario no encontrado' 
      });
    }

    const user = result.recordset[0];

    // Verificar contraseña actual
    const isPasswordValid = currentPassword === user.Clave;
    
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        error: 'Contraseña actual incorrecta' 
      });
    }

    // Actualizar contraseña (en texto plano por ahora)
    await pool.request()
      .input('userId', sql.Int, userId)
      .input('newPassword', sql.NVarChar, newPassword)
      .query(`UPDATE Usuario SET Clave = @newPassword WHERE idUsuario = @userId`);

    res.json({
      success: true,
      message: 'Contraseña cambiada exitosamente'
    });

  } catch (err) {
    console.error('❌ Error cambiando contraseña:', err.message);
    res.status(500).json({ 
      success: false, 
      error: 'Error al cambiar contraseña' 
    });
  }
}

/**
 * Middleware de autenticación
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: 'Acceso denegado. Token no proporcionado.' 
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ 
      success: false, 
      error: 'Token inválido o expirado' 
    });
  }
}

/**
 * Middleware de autorización por rol
 */
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.rol)) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para realizar esta acción'
      });
    }
    next();
  };
}

module.exports = {
  login,
  verifyToken,
  changePassword,
  authenticateToken,
  authorizeRoles
};
