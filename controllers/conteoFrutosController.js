const { getConnection, sql } = require('../config/database');

/**
 * Obtener lista de fundos (OPTIMIZADO - SIN FILTRO)
 */
async function getFundos(req, res) {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT idFundo, Fundo
      FROM Fundo
      ORDER BY Fundo
    `);

    res.json({
      success: true,
      data: result.recordset
    });
  } catch (err) {
    console.error('❌ Error al obtener fundos:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Obtener módulos por fundo (OPTIMIZADO)
 */
async function getModulosByFundo(req, res) {
  try {
    const { idFundo } = req.params;
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('idFundo', sql.Int, idFundo)
      .query(`
        SELECT idModulo, Modulo
        FROM Modulo
        WHERE idFundo = @idFundo
        ORDER BY Modulo
      `);

    res.json({
      success: true,
      data: result.recordset
    });
  } catch (err) {
    console.error('❌ Error al obtener módulos:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Obtener turnos por módulo (OPTIMIZADO)
 */
async function getTurnosByModulo(req, res) {
  try {
    const { idModulo } = req.params;
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('idModulo', sql.Int, idModulo)
      .query(`
        SELECT idTurno, Turno, SubTurno
        FROM Turno
        WHERE idModulo = @idModulo
        ORDER BY Turno, SubTurno
      `);

    res.json({
      success: true,
      data: result.recordset
    });
  } catch (err) {
    console.error('❌ Error al obtener turnos:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Obtener lotes por turno (OPTIMIZADO)
 */
async function getLotesByTurno(req, res) {
  try {
    const { idTurno } = req.params;
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('idTurno', sql.Int, idTurno)
      .query(`
        SELECT 
          L.idLote, 
          L.Lote,
          V.Variedad,
          V.SubVariedad,
          T.Densidad,
          T.Vivero,
          T.Nro_Hileras
        FROM Lote L
        INNER JOIN Variedad V ON V.idVariedad = L.idVariedad
        INNER JOIN Turno T ON T.idTurno = L.idTurno
        WHERE L.idTurno = @idTurno
        ORDER BY L.Lote
      `);

    res.json({
      success: true,
      data: result.recordset
    });
  } catch (err) {
    console.error('❌ Error al obtener lotes:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Obtener datos de conteo de frutos por lote (últimas 2 semanas) - OPTIMIZADO
 */
async function getDatosConteo(req, res) {
  try {
    const { idLote } = req.params;
    const pool = await getConnection();
    
    // PASO 1: Obtener las últimas 2 semanas (rápido)
    const semanasResult = await pool.request()
      .input('idLote', sql.Int, idLote)
      .query(`
        SELECT DISTINCT TOP 2 DATEPART(iso_week, Fecha) as Semana
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        WHERE TBL.idLote = @idLote AND E.Evaluacion = 'Conteos'
        ORDER BY Semana DESC
      `);

    if (semanasResult.recordset.length === 0) {
      return res.json({
        success: true,
        ultimaSemana: { semana: null, datos: [], promedios: {} },
        penultimaSemana: { semana: null, datos: [], promedios: {} }
      });
    }

    const semanas = semanasResult.recordset.map(r => r.Semana);
    const ultimaSemana = semanas[0];
    const penultimaSemana = semanas[1] || semanas[0];

    // PASO 2: Obtener solo los datos necesarios (sin tantos JOINs)
    const result = await pool.request()
      .input('idLote', sql.Int, idLote)
      .input('semana1', sql.Int, ultimaSemana)
      .input('semana2', sql.Int, penultimaSemana)
      .query(`
        SELECT 
          TBL.idtablamaestra as id,
          DATEPART(iso_week, TBL.Fecha) as Semana,
          TBL.Fecha,
          TBL.Hora,
          U.Nombre,
          TBL.Muestra,
          TBL.N_Cuajas as Cuajas,
          TBL.N_FrtVI as VerdeInmaduro,
          TBL.N_FrtVIVT50 as VerdeInm_turg50,
          TBL.N_FrtVT as VerdeTurgente,
          TBL.N_FrtM30 as Marron30,
          TBL.N_FrtM50 as Marron50,
          TBL.N_FrtM75 as Marron75,
          TBL.N_FrtP30 as Pinton30,
          TBL.N_FrtP50 as Pinton50,
          TBL.N_FrtP75 as Pinton75,
          TBL.N_FrtN as Naranja,
          TBL.N_FrtR as Rojo,
          TBL.N_FrtTAPR as TipoAji,
          TBL.N_FrtDS as DeshiSevero,
          TBL.N_FrtDM as DiametroMenor,
          TBL.N_FrtFMD as DeformeModerado,
          TBL.N_FrtDA as DañoAlternaria,
          TBL.N_FrtDescomp as Descompuesto,
          TBL.N_FrtDP as DañoProdiplosis,
          TBL.N_FrtDPR as DañoRoedores,
          TBL.N_FrtRL as RajadoLeve,
          TBL.N_FrtRS as RajadoSevero,
          TBL.N_FrtFC as Cracking,
          TBL.N_FrtFA as FormaAji
        FROM TBL_ProyeccionesPimiento TBL 
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        INNER JOIN Usuario U ON U.idUsuario = TBL.idUsuario
        WHERE TBL.idLote = @idLote 
          AND E.Evaluacion = 'Conteos'
          AND DATEPART(iso_week, TBL.Fecha) IN (@semana1, @semana2)
        ORDER BY TBL.Fecha DESC, TBL.Hora DESC, TBL.Muestra ASC
      `);

    // Separar datos por semana
    const datosUltimaSemana = result.recordset.filter(r => r.Semana === ultimaSemana);
    const datosPenultimaSemana = result.recordset.filter(r => r.Semana === penultimaSemana);

    res.json({
      success: true,
      ultimaSemana: {
        semana: ultimaSemana,
        datos: datosUltimaSemana,
        promedios: calcularPromedios(datosUltimaSemana)
      },
      penultimaSemana: {
        semana: penultimaSemana,
        datos: datosPenultimaSemana,
        promedios: calcularPromedios(datosPenultimaSemana)
      }
    });
  } catch (err) {
    console.error('❌ Error al obtener datos conteo:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}
/**
 * Actualizar registro de conteo (solo última semana)
 */
async function actualizarRegistro(req, res) {
  try {
    const { id } = req.params;
    const datos = req.body;

    const pool = await getConnection();

    // Campos numéricos editables (todos los campos de conteo)
    const camposEditables = [
      'Cuajas', 'VerdeInmaduro', 'VerdeInm_turg50', 'VerdeTurgente',
      'Marron30', 'Marron50', 'Marron75', 'Pinton30', 'Pinton50', 'Pinton75',
      'Naranja', 'Rojo', 'TipoAji', 'DeshiSevero', 'DiametroMenor',
      'DeformeModerado', 'DañoAlternaria', 'Descompuesto', 'DañoProdiplosis',
      'DañoRoedores', 'RajadoLeve', 'RajadoSevero', 'Cracking', 'FormaAji'
    ];

    // Mapeo de nombres frontend a nombres de BD
    const mapeoColumnas = {
      'Cuajas': 'N_Cuajas',
      'VerdeInmaduro': 'N_FrtVI',
      'VerdeInm_turg50': 'N_FrtVIVT50',
      'VerdeTurgente': 'N_FrtVT',
      'Marron30': 'N_FrtM30',
      'Marron50': 'N_FrtM50',
      'Marron75': 'N_FrtM75',
      'Pinton30': 'N_FrtP30',
      'Pinton50': 'N_FrtP50',
      'Pinton75': 'N_FrtP75',
      'Naranja': 'N_FrtN',
      'Rojo': 'N_FrtR',
      'TipoAji': 'N_FrtTAPR',
      'DeshiSevero': 'N_FrtDS',
      'DiametroMenor': 'N_FrtDM',
      'DeformeModerado': 'N_FrtFMD',
      'DañoAlternaria': 'N_FrtDA',
      'Descompuesto': 'N_FrtDescomp',
      'DañoProdiplosis': 'N_FrtDP',
      'DañoRoedores': 'N_FrtDPR',
      'RajadoLeve': 'N_FrtRL',
      'RajadoSevero': 'N_FrtRS',
      'Cracking': 'N_FrtFC',
      'FormaAji': 'N_FrtFA'
    };

    // Construir query UPDATE dinámicamente
    const setClauses = [];
    const request = pool.request();
    request.input('id', sql.Int, id);

    for (const campo of camposEditables) {
      if (datos.hasOwnProperty(campo)) {
        const nombreColumna = mapeoColumnas[campo] || campo;
        setClauses.push(`${nombreColumna} = @${campo}`);
        request.input(campo, sql.Float, datos[campo] || null);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay campos para actualizar'
      });
    }

    const query = `
      UPDATE TBL_ProyeccionesPimiento
      SET ${setClauses.join(', ')}
      WHERE idtablamaestra = @id
    `;

    await request.query(query);

    res.json({
      success: true,
      message: 'Registro actualizado correctamente'
    });
  } catch (err) {
    console.error('❌ Error al actualizar registro:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Calcular promedios de campos numéricos
 */
function calcularPromedios(datos) {
  if (datos.length === 0) return {};

  const camposNumericos = [
    'Cuajas', 'VerdeInmaduro', 'VerdeInm_turg50', 'VerdeTurgente',
    'Marron30', 'Marron50', 'Marron75', 'Pinton30', 'Pinton50', 'Pinton75',
    'Naranja', 'Rojo', 'TipoAji', 'DeshiSevero', 'DiametroMenor',
    'DeformeModerado', 'DañoAlternaria', 'Descompuesto', 'DañoProdiplosis',
    'DañoRoedores', 'RajadoLeve', 'RajadoSevero', 'Cracking', 'FormaAji'
  ];

  const promedios = {};

  for (const campo of camposNumericos) {
    const valores = datos
      .map(d => d[campo])
      .filter(v => v !== null && v !== undefined && !isNaN(v));
    
    if (valores.length > 0) {
      const suma = valores.reduce((acc, val) => acc + parseFloat(val), 0);
      promedios[campo] = (suma / valores.length).toFixed(2);
    } else {
      promedios[campo] = 0;
    }
  }

  return promedios;
}

module.exports = {
  getFundos,
  getModulosByFundo,
  getTurnosByModulo,
  getLotesByTurno,
  getDatosConteo,
  actualizarRegistro
};
