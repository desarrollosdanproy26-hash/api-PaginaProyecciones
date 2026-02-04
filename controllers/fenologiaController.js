const { getConnection, sql } = require('../config/database');

/**
 * Obtener lista de fundos (OPTIMIZADO - SIN FILTROS)
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

async function getModulosByFundo(req, res) {
  try {
    const { idFundo } = req.params;
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('idFundo', sql.Int, idFundo)
      .query(`
        SELECT 
            m.idModulo, 
            m.Modulo,
            CASE 
                WHEN EXISTS (
                    SELECT 1 
                    FROM Turno t
                    INNER JOIN Lote l ON l.idTurno = t.idTurno
                    INNER JOIN TBL_ProyeccionesPimiento p ON p.idLote = l.idLote
                    WHERE t.idModulo = m.idModulo 
                    AND p.Validacion = 2
                ) THEN 'rojo'
                ELSE 'verde'
            END AS Color
        FROM Modulo m
        WHERE m.idFundo = @idFundo
        ORDER BY m.Modulo
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

async function getTurnosByModulo(req, res) {
  try {
    const { idModulo } = req.params;
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('idModulo', sql.Int, idModulo)
      .query(`
        SELECT 
            t.idTurno, 
            t.Turno, 
            t.SubTurno,
            CASE 
                WHEN EXISTS (
                    SELECT 1 
                    FROM Lote l
                    INNER JOIN TBL_ProyeccionesPimiento p ON p.idLote = l.idLote
                    WHERE l.idTurno = t.idTurno 
                    AND p.Validacion = 2
                ) THEN 'rojo'
                ELSE 'verde'
            END AS Color
        FROM Turno t
        WHERE t.idModulo = @idModulo
        ORDER BY t.Turno, t.SubTurno
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
          CASE 
            WHEN EXISTS (
                SELECT 1 FROM TBL_ProyeccionesPimiento P 
                WHERE P.idLote = L.idLote AND P.Validacion = 2
            ) THEN 'rojo'
            ELSE 'verde'
          END AS Color
        FROM Lote L
        INNER JOIN Variedad V ON V.idVariedad = L.idVariedad
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
 * Obtener datos de fenología por lote (últimas 2 semanas) - OPTIMIZADO
 */
async function getDatosFenologia(req, res) {
  try {
    const { idLote } = req.params;
    const pool = await getConnection();
    
    // PASO 1: Obtener el año máximo
    const anioResult = await pool.request()
      .input('idLote', sql.Int, idLote)
      .query(`
        SELECT MAX(YEAR(Fecha)) as MaxAnio
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        WHERE TBL.idLote = @idLote AND E.Evaluacion = 'Fenologia'
      `);
    
    const maxAnio = anioResult.recordset[0]?.MaxAnio;
    if (!maxAnio) {
      return res.json({
        success: true,
        ultimaSemana: { semana: null, datos: [], promedios: {} },
        penultimaSemana: { semana: null, datos: [], promedios: {} }
      });
    }
    
    // PASO 2: Obtener las últimas 2 semanas del año máximo
    const semanasResult = await pool.request()
      .input('idLote', sql.Int, idLote)
      .input('maxAnio', sql.Int, maxAnio)
      .query(`
        SELECT DISTINCT TOP 2 DATEPART(iso_week, Fecha) as Semana
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        WHERE TBL.idLote = @idLote AND E.Evaluacion = 'Fenologia' AND YEAR(Fecha) = @maxAnio
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
    
    // PASO 3: Obtener solo los datos necesarios del año máximo y semanas filtradas
    const result = await pool.request()
      .input('idLote', sql.Int, idLote)
      .input('maxAnio', sql.Int, maxAnio)
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
          TBL.AltPlant as AlturaPlanta,
          TBL.N_bot as Botones,
          TBL.N_Flor as Flores,
          TBL.N_Cuajas as Cuajas,
          TBL.N_PC as PreCuajas,
          TBL.N_CDeforP as CuajaDeforme,
          TBL.N_CDA AS CuajasDañoAlternaria,
          TBL.N_CDP as CuajaDañoProdi,
          TBL.N_FrtN1 as FrutoNivel1,
          TBL.N_FrtfQ as FrutosQuemados,
          TBL.N_FrtFMD as FrutosDeformes,
          TBL.N_FrtDeforL as DeformeLeve,
          TBL.N_FrtTAPR as TipoAji,
          TBL.N_FrtFA as FormaAji,
          TBL.N_FrtDA as DañoAlternaria,
          TBL.N_FrtDP as DañoProdiplosis,
          TBL.N_FrtDescomp AS FrutosDescompuestos,
          TBL.N_FrtDM AS DiametroMenor,
          TBL.N_FrtDPR as DañoRoedores,
          TBL.N_FrtDPP as DañoPajaros
        FROM TBL_ProyeccionesPimiento TBL 
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        INNER JOIN Usuario U ON U.idUsuario = TBL.idUsuario
        WHERE TBL.idLote = @idLote 
          AND E.Evaluacion = 'Fenologia'
          AND YEAR(TBL.Fecha) = @maxAnio
          AND DATEPART(iso_week, TBL.Fecha) IN (@semana1, @semana2)
          AND TBL.Validacion != 0
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
    console.error('❌ Error al obtener datos fenología:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Actualizar registro de fenología
 * ✅ AHORA CAMBIA VALIDACION DE 2 A 1 AL EDITAR
 */
async function actualizarRegistro(req, res) {
  try {
    const { id } = req.params;
    const datos = req.body;

    const pool = await getConnection();

    // Campos numéricos editables
    const camposEditables = [
      'AlturaPlanta',
      'Botones',
      'Flores',
      'Cuajas',
      'PreCuajas',
      'CuajaDeforme',
      'CuajasDañoAlternaria',
      'CuajaDañoProdi',
      'FrutoNivel1',
      'FrutosQuemados',
      'FrutosDeformes',
      'DeformeLeve',
      'TipoAji',
      'FormaAji',
      'DañoAlternaria',
      'DañoProdiplosis',
      'FrutosDescompuestos',
      'DiametroMenor',
      'DañoRoedores',
      'DañoPajaros'
    ];

    // Mapeo de nombres frontend a nombres de BD
    const mapeoColumnas = {
      AlturaPlanta: 'AltPlant',
      Botones: 'N_bot',
      Flores: 'N_Flor',
      Cuajas: 'N_Cuajas',
      PreCuajas: 'N_PC',
      CuajaDeforme: 'N_CDeforP',
      CuajasDañoAlternaria: 'N_CDA',
      CuajaDañoProdi: 'N_CDP',
      FrutoNivel1: 'N_FrtN1',
      FrutosQuemados: 'N_FrtfQ',
      FrutosDeformes: 'N_FrtFMD',
      DeformeLeve: 'N_FrtDeforL',
      TipoAji: 'N_FrtTAPR',
      FormaAji: 'N_FrtFA',
      DañoAlternaria: 'N_FrtDA',
      DañoProdiplosis: 'N_FrtDP',
      FrutosDescompuestos: 'N_FrtDescomp',
      DiametroMenor: 'N_FrtDM',
      DañoRoedores: 'N_FrtDPR',
      DañoPajaros: 'N_FrtDPP'
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

    // ✅ AGREGAR: Cambiar Validacion a 1 al editar
    setClauses.push('Validacion = 1');

    const query = `
      UPDATE TBL_ProyeccionesPimiento
      SET ${setClauses.join(', ')}
      WHERE idtablamaestra = @id
    `;

    await request.query(query);

    res.json({
      success: true,
      message: 'Registro actualizado correctamente (Validacion cambiada a 1)'
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
    'AlturaPlanta',
    'Botones',
    'Flores',
    'Cuajas',
    'PreCuajas',
    'CuajaDeforme',
    'CuajasDañoAlternaria',
    'CuajaDañoProdi',
    'FrutoNivel1',
    'FrutosQuemados',
    'FrutosDeformes',
    'DeformeLeve',
    'TipoAji',
    'FormaAji',
    'DañoAlternaria',
    'DañoProdiplosis',
    'FrutosDescompuestos',
    'DiametroMenor',
    'DañoRoedores',
    'DañoPajaros'
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

/**
 * Obtener promedios a NIVEL TURNO (todos los lotes del turno) - últimas 2 semanas
 */
async function getDatosNivelTurno(req, res) {
  try {
    const { idTurno } = req.params;
    const pool = await getConnection();
    
    // PASO 1: Obtener el año máximo
    const anioResult = await pool.request()
      .input('idTurno', sql.Int, idTurno)
      .query(`
        SELECT MAX(YEAR(Fecha)) as MaxAnio
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        INNER JOIN Lote L ON L.idLote = TBL.idLote
        WHERE L.idTurno = @idTurno AND E.Evaluacion = 'Fenologia'
      `);
    
    const maxAnio = anioResult.recordset[0]?.MaxAnio;
    if (!maxAnio) {
      return res.json({
        success: true,
        ultimaSemana: { semana: null, promedios: {} },
        penultimaSemana: { semana: null, promedios: {} }
      });
    }
    
    // PASO 2: Obtener las últimas 2 semanas del año máximo
    const semanasResult = await pool.request()
      .input('idTurno', sql.Int, idTurno)
      .input('maxAnio', sql.Int, maxAnio)
      .query(`
        SELECT DISTINCT TOP 2 DATEPART(iso_week, Fecha) as Semana
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        INNER JOIN Lote L ON L.idLote = TBL.idLote
        WHERE L.idTurno = @idTurno AND E.Evaluacion = 'Fenologia' AND YEAR(Fecha) = @maxAnio
        ORDER BY Semana DESC
      `);
    
    if (semanasResult.recordset.length === 0) {
      return res.json({
        success: true,
        ultimaSemana: { semana: null, promedios: {} },
        penultimaSemana: { semana: null, promedios: {} }
      });
    }
    
    const semanas = semanasResult.recordset.map(r => r.Semana);
    const ultimaSemana = semanas[0];
    const penultimaSemana = semanas[1] || semanas[0];
    
    // PASO 3: Obtener datos AGRUPADOS por lote
    const result = await pool.request()
      .input('idTurno', sql.Int, idTurno)
      .input('maxAnio', sql.Int, maxAnio)
      .input('semana1', sql.Int, ultimaSemana)
      .input('semana2', sql.Int, penultimaSemana)
      .query(`
        SELECT 
          DATEPART(iso_week, TBL.Fecha) as Semana,
          TBL.Fecha,
          L.idLote,
          L.Lote,
          TBL.AltPlant as AlturaPlanta,
          TBL.N_bot as Botones,
          TBL.N_Flor as Flores,
          TBL.N_Cuajas as Cuajas,
          TBL.N_PC as PreCuajas,
          TBL.N_CDeforP as CuajaDeforme,
          TBL.N_CDA AS CuajasDañoAlternaria,
          TBL.N_CDP as CuajaDañoProdi,
          TBL.N_FrtN1 as FrutoNivel1,
          TBL.N_FrtfQ as FrutosQuemados,
          TBL.N_FrtFMD as FrutosDeformes,
          TBL.N_FrtDeforL as DeformeLeve,
          TBL.N_FrtTAPR as TipoAji,
          TBL.N_FrtFA as FormaAji,
          TBL.N_FrtDA as DañoAlternaria,
          TBL.N_FrtDP as DañoProdiplosis,
          TBL.N_FrtDescomp AS FrutosDescompuestos,
          TBL.N_FrtDM AS DiametroMenor,
          TBL.N_FrtDPR as DañoRoedores,
          TBL.N_FrtDPP as DañoPajaros
        FROM TBL_ProyeccionesPimiento TBL 
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        INNER JOIN Lote L ON L.idLote = TBL.idLote
        WHERE L.idTurno = @idTurno 
          AND E.Evaluacion = 'Fenologia'
          AND YEAR(TBL.Fecha) = @maxAnio
          AND DATEPART(iso_week, TBL.Fecha) IN (@semana1, @semana2)
        ORDER BY L.Lote, DATEPART(iso_week, TBL.Fecha)
      `);
    
    // Separar por semana
    const datosUltimaSemana = result.recordset.filter(r => r.Semana === ultimaSemana);
    const datosPenultimaSemana = result.recordset.filter(r => r.Semana === penultimaSemana);
    
    // Agrupar por lote y calcular promedios
    const agruparPorLote = (datos) => {
      const lotes = {};
      datos.forEach(registro => {
        if (!lotes[registro.idLote]) {
          lotes[registro.idLote] = {
            idLote: registro.idLote,
            Lote: registro.Lote,
            datos: []
          };
        }
        lotes[registro.idLote].datos.push(registro);
      });
      
      // Calcular promedios por lote
      return Object.values(lotes).map(lote => ({
        idLote: lote.idLote,
        Lote: lote.Lote,
        fecha: lote.datos[0]?.Fecha || null,
        promedios: calcularPromedios(lote.datos)
      }));
    };
    
    const lotesPenultimaSemana = agruparPorLote(datosPenultimaSemana);
    const lotesUltimaSemana = agruparPorLote(datosUltimaSemana);
    
    // Calcular promedio GENERAL del turno
    const promedioGeneralPenultima = calcularPromedios(datosPenultimaSemana);
    const promedioGeneralUltima = calcularPromedios(datosUltimaSemana);
    
    res.json({
      success: true,
      ultimaSemana: {
        semana: ultimaSemana,
        lotes: lotesUltimaSemana,
        promedioGeneral: promedioGeneralUltima
      },
      penultimaSemana: {
        semana: penultimaSemana,
        lotes: lotesPenultimaSemana,
        promedioGeneral: promedioGeneralPenultima
      }
    });
  } catch (err) {
    console.error('❌ Error al obtener datos nivel turno:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Obtener promedios a NIVEL LOTE
 * ✅ AHORA ENVÍA esEditable = TRUE si TODOS los registros tienen Validacion = 2
 */
async function getDatosNivelLote(req, res) {
  try {
    const { idLote } = req.params;
    const pool = await getConnection();
    
    // PASO 1: Obtener el año máximo
    const anioResult = await pool.request()
      .input('idLote', sql.Int, idLote)
      .query(`
        SELECT MAX(YEAR(Fecha)) as MaxAnio
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        WHERE TBL.idLote = @idLote AND E.Evaluacion = 'Fenologia'
      `);
    
    const maxAnio = anioResult.recordset[0]?.MaxAnio;
    if (!maxAnio) {
      return res.json({
        success: true,
        esEditable: false,
        ultimaSemana: { semana: null, promedios: {} },
        penultimaSemana: { semana: null, promedios: {} }
      });
    }
    
    // PASO 2: Obtener las últimas 2 semanas del año máximo
    const semanasResult = await pool.request()
      .input('idLote', sql.Int, idLote)
      .input('maxAnio', sql.Int, maxAnio)
      .query(`
        SELECT DISTINCT TOP 2 DATEPART(iso_week, Fecha) as Semana
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        WHERE TBL.idLote = @idLote AND E.Evaluacion = 'Fenologia' AND YEAR(Fecha) = @maxAnio
        ORDER BY Semana DESC
      `);
    
    if (semanasResult.recordset.length === 0) {
      return res.json({
        success: true,
        esEditable: false,
        ultimaSemana: { semana: null, promedios: {} },
        penultimaSemana: { semana: null, promedios: {} }
      });
    }
    
    const semanas = semanasResult.recordset.map(r => r.Semana);
    const ultimaSemana = semanas[0];
    const penultimaSemana = semanas[1] || semanas[0];
    
    // PASO 3: Obtener TODOS los datos del lote para calcular promedios
    const result = await pool.request()
      .input('idLote', sql.Int, idLote)
      .input('maxAnio', sql.Int, maxAnio)
      .input('semana1', sql.Int, ultimaSemana)
      .input('semana2', sql.Int, penultimaSemana)
      .query(`
        SELECT 
          DATEPART(iso_week, TBL.Fecha) as Semana,
          TBL.Fecha,
          L.Lote,
          TBL.AltPlant as AlturaPlanta,
          TBL.N_bot as Botones,
          TBL.N_Flor as Flores,
          TBL.N_Cuajas as Cuajas,
          TBL.N_PC as PreCuajas,
          TBL.N_CDeforP as CuajaDeforme,
          TBL.N_CDA AS CuajasDañoAlternaria,
          TBL.N_CDP as CuajaDañoProdi,
          TBL.N_FrtN1 as FrutoNivel1,
          TBL.N_FrtfQ as FrutosQuemados,
          TBL.N_FrtFMD as FrutosDeformes,
          TBL.N_FrtDeforL as DeformeLeve,
          TBL.N_FrtTAPR as TipoAji,
          TBL.N_FrtFA as FormaAji,
          TBL.N_FrtDA as DañoAlternaria,
          TBL.N_FrtDP as DañoProdiplosis,
          TBL.N_FrtDescomp AS FrutosDescompuestos,
          TBL.N_FrtDM AS DiametroMenor,
          TBL.N_FrtDPR as DañoRoedores,
          TBL.N_FrtDPP as DañoPajaros
        FROM TBL_ProyeccionesPimiento TBL 
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        INNER JOIN Lote L ON L.idLote = TBL.idLote
        WHERE TBL.idLote = @idLote 
          AND E.Evaluacion = 'Fenologia'
          AND YEAR(TBL.Fecha) = @maxAnio
          AND DATEPART(iso_week, TBL.Fecha) IN (@semana1, @semana2)
      `);
    
    // Separar y calcular promedios por semana
    const datosUltimaSemana = result.recordset.filter(r => r.Semana === ultimaSemana);
    const datosPenultimaSemana = result.recordset.filter(r => r.Semana === penultimaSemana);

    // ✅ VERIFICAR: ¿TODOS los registros de la última semana tienen Validacion=2?
    const validacionResult = await pool.request()
      .input('idLote', sql.Int, idLote)
      .input('maxAnio', sql.Int, maxAnio)
      .input('semana1', sql.Int, ultimaSemana)
      .query(`
        SELECT 
          COUNT(*) as Total,
          SUM(CASE WHEN TBL.Validacion = 2 THEN 1 ELSE 0 END) as TotalValidados
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        WHERE TBL.idLote = @idLote 
          AND E.Evaluacion = 'Fenologia'
          AND YEAR(TBL.Fecha) = @maxAnio
          AND DATEPART(iso_week, TBL.Fecha) = @semana1
      `);
    
    const resultado = validacionResult.recordset[0];
    const todosValidados = resultado.Total > 0 && resultado.Total === resultado.TotalValidados;
    
    res.json({
      success: true,
      esEditable: todosValidados, // ✅ TRUE si todos tienen Validacion=2
      ultimaSemana: {
        semana: ultimaSemana,
        promedios: calcularPromedios(datosUltimaSemana)
      },
      penultimaSemana: {
        semana: penultimaSemana,
        promedios: calcularPromedios(datosPenultimaSemana)
      }
    });
  } catch (err) {
    console.error('❌ Error al obtener datos nivel lote:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Cambiar validación de lote
 * Esta función cambia TODOS los registros de un lote de Validacion=2 a otro valor
 */
async function cambiarValidacionLote(req, res) {
  try {
    const { idLote } = req.params;
    const { validacionNueva } = req.body;
    
    const pool = await getConnection();
    
    await pool.request()
      .input('idLote', sql.Int, idLote)
      .input('validacionNueva', sql.Int, validacionNueva)
      .query(`
        UPDATE TBL_ProyeccionesPimiento
        SET Validacion = @validacionNueva
        WHERE idLote = @idLote AND Validacion = 2
      `);
    
    res.json({
      success: true,
      message: 'Validación actualizada correctamente'
    });
  } catch (err) {
    console.error('❌ Error al cambiar validación:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getFundos,
  getModulosByFundo,
  getTurnosByModulo,
  getLotesByTurno,
  getDatosFenologia,
  actualizarRegistro,
  getDatosNivelTurno,
  getDatosNivelLote,
  cambiarValidacionLote
};