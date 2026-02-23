const { getConnection, sql } = require('../config/database');

async function getFundos(req, res) {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT idFundo, Fundo
      FROM Fundo
      ORDER BY Fundo
    `);
    res.json({ success: true, data: result.recordset });
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
                WHEN MAX(CASE WHEN p.Validacion = 2 THEN 1 ELSE 0 END) = 1 THEN 'rojo'
                WHEN MAX(CASE WHEN p.Validacion = 1 THEN 1 ELSE 0 END) = 1 THEN 'verde'
                ELSE 'gris'
            END AS Color
        FROM Modulo m
        LEFT JOIN Turno t ON t.idModulo = m.idModulo
        LEFT JOIN Lote l ON l.idTurno = t.idTurno
        LEFT JOIN TBL_ProyeccionesPimiento p ON p.idLote = l.idLote AND p.Validacion != 0
        LEFT JOIN Evaluacion e ON e.idEvaluacion = p.IdEvaluacion AND e.Evaluacion = 'Fenologia'
        WHERE m.idFundo = @idFundo
        GROUP BY m.idModulo, m.Modulo
        ORDER BY m.Modulo
      `);
    res.json({ success: true, data: result.recordset });
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
                WHEN MAX(CASE WHEN p.Validacion = 2 THEN 1 ELSE 0 END) = 1 THEN 'rojo'
                WHEN MAX(CASE WHEN p.Validacion = 1 THEN 1 ELSE 0 END) = 1 THEN 'verde'
                ELSE 'gris'
            END AS Color
        FROM Turno t
        LEFT JOIN Lote l ON l.idTurno = t.idTurno
        LEFT JOIN TBL_ProyeccionesPimiento p ON p.idLote = l.idLote AND p.Validacion != 0
        LEFT JOIN Evaluacion e ON e.idEvaluacion = p.IdEvaluacion AND e.Evaluacion = 'Fenologia'
        WHERE t.idModulo = @idModulo
        GROUP BY t.idTurno, t.Turno, t.SubTurno
        ORDER BY t.Turno, t.SubTurno
      `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('❌ Error al obtener turnos:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getDatosTurnoTresSemanas(req, res) {
  try {
    const { idTurno } = req.params;
    const pool = await getConnection();

    // CONSOLIDAR FRUTOS AUTOMÁTICAMENTE para este turno (solo si hay datos que consolidar)
    const necesitaConsolidar = await pool.request()
      .input('idTurno', sql.Int, idTurno)
      .query(`
        SELECT TOP 1 1 as hay
        FROM TBL_ProyeccionesPimiento
        WHERE idLote IN (SELECT idLote FROM Lote WHERE idTurno = @idTurno)
        AND IdEvaluacion IN (SELECT idEvaluacion FROM Evaluacion WHERE Evaluacion = 'Fenologia')
        AND Validacion != 0
        AND (N_FrtN2 != 0 OR N_FrtN3 != 0 OR N_FrtN4 != 0 OR N_FrtN5 != 0 OR N_FrtN6 != 0)
      `);

    if (necesitaConsolidar.recordset.length > 0) {
      await pool.request()
        .input('idTurno', sql.Int, idTurno)
        .query(`
          UPDATE TBL_ProyeccionesPimiento
          SET N_FrtN1 = ISNULL(N_FrtN1, 0) + ISNULL(N_FrtN2, 0) + ISNULL(N_FrtN3, 0) + 
                        ISNULL(N_FrtN4, 0) + ISNULL(N_FrtN5, 0) + ISNULL(N_FrtN6, 0),
              N_FrtN2 = 0,
              N_FrtN3 = 0,
              N_FrtN4 = 0,
              N_FrtN5 = 0,
              N_FrtN6 = 0
          WHERE idLote IN (SELECT idLote FROM Lote WHERE idTurno = @idTurno)
          AND IdEvaluacion IN (SELECT idEvaluacion FROM Evaluacion WHERE Evaluacion = 'Fenologia')
          AND Validacion != 0
          AND (N_FrtN2 != 0 OR N_FrtN3 != 0 OR N_FrtN4 != 0 OR N_FrtN5 != 0 OR N_FrtN6 != 0)
        `);
    }

    const infoResult = await pool.request()
      .input('idTurno', sql.Int, idTurno)
      .query(`
        SELECT TOP 1 V.Variedad, T.Turno, T.SubTurno, M.Modulo
        FROM Turno T
        INNER JOIN Modulo M ON M.idModulo = T.idModulo
        LEFT JOIN Lote L ON L.idTurno = T.idTurno
        LEFT JOIN Variedad V ON V.idVariedad = L.idVariedad
        WHERE T.idTurno = @idTurno
      `);

    const variedad = infoResult.recordset[0]?.Variedad || 'N/A';
    const modulo = infoResult.recordset[0]?.Modulo || '';
    const turno = infoResult.recordset[0]?.Turno || '';
    const subturno = infoResult.recordset[0]?.SubTurno || '';

    const anioResult = await pool.request()
      .input('idTurno', sql.Int, idTurno)
      .query(`
        SELECT MAX(YEAR(Fecha)) as MaxAnio
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        INNER JOIN Lote L ON L.idLote = TBL.idLote
        WHERE L.idTurno = @idTurno AND E.Evaluacion = 'Fenologia' AND TBL.Validacion != 0
      `);

    const maxAnio = anioResult.recordset[0]?.MaxAnio;
    if (!maxAnio) {
      return res.json({ success: true, variedad, modulo, turno, subturno, semanas: [] });
    }

    const semanasResult = await pool.request()
      .input('idTurno', sql.Int, idTurno)
      .input('maxAnio', sql.Int, maxAnio)
      .query(`
        SELECT DISTINCT TOP 3 DATEPART(iso_week, Fecha) as Semana
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        INNER JOIN Lote L ON L.idLote = TBL.idLote
        WHERE L.idTurno = @idTurno AND E.Evaluacion = 'Fenologia' AND YEAR(Fecha) = @maxAnio AND TBL.Validacion != 0
        ORDER BY Semana DESC
      `);

    if (semanasResult.recordset.length === 0) {
      return res.json({ success: true, variedad, modulo, turno, subturno, semanas: [] });
    }

    const semanas = semanasResult.recordset.map(r => r.Semana).reverse();

    const result = await pool.request()
      .input('idTurno', sql.Int, idTurno)
      .input('maxAnio', sql.Int, maxAnio)
      .query(`
              SELECT 
  DATEPART(iso_week, TBL.Fecha) as Semana,
  CONVERT(VARCHAR(10), TBL.Fecha, 23) as Fecha,
  L.idLote, L.Lote,
  DATEDIFF(DAY, T.FechaSiembra, TBL.Fecha) AS EdadCultivo,
  CASE 
    WHEN TBL.Fecha < T.FechaSiembra THEN NULL
    ELSE DATEDIFF(DAY, DATEADD(DAY, 1 - DATEPART(WEEKDAY, T.FechaSiembra), T.FechaSiembra), DATEADD(DAY, 1 - DATEPART(WEEKDAY, TBL.Fecha), TBL.Fecha)) / 7
  END AS SemanaCultivo,
  U.Umb_Alt as UmbralAltura,
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
  TBL.N_FrtDPP as DañoPajaros,
  TBL.Validacion,
  C.VI, C.VT, C.M30, C.M50, C.M75,
  C.P30, C.P50, C.P75, C.VMP30, C.VMP50, C.VMP75,
  C.PN, C.NP, C.N, C.RM, C.R,
  C.Craking, C.RajL, C.RajMod, C.RajS,
  C.DeshL, C.DeshS, C.Virus, C.Trips,
  C.PudBasal, C.DeficienciaCalcio, C.FrtCC
FROM TBL_ProyeccionesPimiento TBL 
INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
INNER JOIN Lote L ON L.idLote = TBL.idLote
INNER JOIN Turno T ON T.idTurno = L.idTurno
INNER JOIN Modulo M ON M.idModulo = T.idModulo
INNER JOIN Fundo F ON F.idFundo = M.idFundo
INNER JOIN Variedad V ON V.idVariedad = L.idVariedad
LEFT JOIN vw_TBL_Llave_Umbral LU 
  ON CONCAT(F.Fundo, '-', M.Modulo, '-', T.SubTurno) = LU.llave
LEFT JOIN vw_TBL_Umbral_Fenologia U 
  ON U.llave = CONCAT(
       LU.llaveComp, '-',
       CASE 
         WHEN TBL.Fecha < T.FechaSiembra THEN NULL
         ELSE DATEDIFF(DAY, DATEADD(DAY, 1 - DATEPART(WEEKDAY, T.FechaSiembra), T.FechaSiembra), DATEADD(DAY, 1 - DATEPART(WEEKDAY, TBL.Fecha), TBL.Fecha)) / 7
       END,
       '-', V.Variedad
     )
  AND U.Evaluacion = 'Fenologia'
LEFT JOIN vw_ConteosFeno C
  ON F.Fundo = C.Fundo
  AND M.Modulo = C.Modulo
  AND T.SubTurno = C.Turno
  AND L.Lote = C.Lote
  AND DATEPART(iso_week, TBL.Fecha) = C.Semana
  AND YEAR(DATEADD(day, 26 - DATEPART(iso_week, TBL.Fecha), TBL.Fecha)) = C.Año
WHERE L.idTurno = @idTurno 
  AND E.Evaluacion = 'Fenologia'
  AND YEAR(TBL.Fecha) = @maxAnio
  AND DATEPART(iso_week, TBL.Fecha) IN (${semanas.join(',')})
  AND TBL.Validacion != 0
ORDER BY DATEPART(iso_week, TBL.Fecha) ASC, L.Lote
      `);

    const semanasDatos = semanas.map(numSemana => {
      const datosSemana = result.recordset.filter(r => r.Semana === numSemana);
      const lotes = {};
      
      datosSemana.forEach(registro => {
        if (!lotes[registro.idLote]) {
          lotes[registro.idLote] = { idLote: registro.idLote, Lote: registro.Lote, datos: [] };
        }
        lotes[registro.idLote].datos.push(registro);
      });

      const lotesConPromedios = Object.values(lotes).map(lote => ({
        idLote: lote.idLote,
        Lote: lote.Lote,
        fecha: lote.datos[0]?.Fecha || null,
        EdadCultivo: lote.datos[0]?.EdadCultivo || null,
        UmbralAltura: lote.datos[0]?.UmbralAltura || null,
        promedios: calcularPromedios(lote.datos),
        validacion: lote.datos[0]?.Validacion || 3
      }));

      const promedioGeneral = calcularPromedios(datosSemana);
      const esUltimaSemana = numSemana === semanas[semanas.length - 1];
      const hayValidacion2 = datosSemana.some(d => d.Validacion === 2|| d.Validacion === 1);

      return {
        semana: numSemana,
        lotes: lotesConPromedios,
        promedioGeneral,
        editable: esUltimaSemana && hayValidacion2
      };
    });

    res.json({ success: true, variedad, modulo, turno, subturno, semanas: semanasDatos });
  } catch (err) {
    console.error('❌ Error al obtener datos turno:', err.message);
    res.status(500).json({ success: false, error: err.message, stack: err.toString() }); 
  }
}

async function getDatosLoteTresSemanas(req, res) {
  try {
    const { idLote } = req.params;
    const pool = await getConnection();

    const infoResult = await pool.request()
      .input('idLote', sql.Int, idLote)
      .query(`
        SELECT V.Variedad, L.Lote, T.Turno, T.SubTurno, M.Modulo
        FROM Lote L
        INNER JOIN Variedad V ON V.idVariedad = L.idVariedad
        INNER JOIN Turno T ON T.idTurno = L.idTurno
        INNER JOIN Modulo M ON M.idModulo = T.idModulo
        WHERE L.idLote = @idLote
      `);

    const variedad = infoResult.recordset[0]?.Variedad || 'N/A';
    const loteNombre = infoResult.recordset[0]?.Lote || '';
    const modulo = infoResult.recordset[0]?.Modulo || '';
    const turno = infoResult.recordset[0]?.Turno || '';
    const subturno = infoResult.recordset[0]?.SubTurno || '';

    const anioResult = await pool.request()
      .input('idLote', sql.Int, idLote)
      .query(`
        SELECT MAX(YEAR(Fecha)) as MaxAnio
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        WHERE TBL.idLote = @idLote AND E.Evaluacion = 'Fenologia' AND TBL.Validacion != 0
      `);

    const maxAnio = anioResult.recordset[0]?.MaxAnio;
    if (!maxAnio) {
      return res.json({ success: true, variedad, loteNombre, modulo, turno, subturno, semanas: [] });
    }

    const semanasResult = await pool.request()
      .input('idLote', sql.Int, idLote)
      .input('maxAnio', sql.Int, maxAnio)
      .query(`
        SELECT DISTINCT TOP 3 DATEPART(iso_week, Fecha) as Semana
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        WHERE TBL.idLote = @idLote AND E.Evaluacion = 'Fenologia' AND YEAR(Fecha) = @maxAnio AND TBL.Validacion != 0
        ORDER BY Semana DESC
      `);

    if (semanasResult.recordset.length === 0) {
      return res.json({ success: true, variedad, loteNombre, modulo, turno, subturno, semanas: [] });
    }

    const semanas = semanasResult.recordset.map(r => r.Semana).reverse();

    const result = await pool.request()
      .input('idLote', sql.Int, idLote)
      .input('maxAnio', sql.Int, maxAnio)
      .query(`
        SELECT 
          TBL.idtablamaestra as id,
          DATEPART(iso_week, TBL.Fecha) as Semana,
          CONVERT(VARCHAR(10), TBL.Fecha, 23) as Fecha,
          TBL.Hora, U.Nombre, TBL.Muestra,
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
          TBL.N_FrtDPP as DañoPajaros,
          TBL.Validacion
        FROM TBL_ProyeccionesPimiento TBL 
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        INNER JOIN Usuario U ON U.idUsuario = TBL.idUsuario
        WHERE TBL.idLote = @idLote 
          AND E.Evaluacion = 'Fenologia'
          AND YEAR(TBL.Fecha) = @maxAnio
          AND DATEPART(iso_week, TBL.Fecha) IN (${semanas.join(',')})
          AND TBL.Validacion != 0
        ORDER BY DATEPART(iso_week, TBL.Fecha) ASC, TBL.Fecha DESC, TBL.Hora DESC
      `);

    const semanasDatos = semanas.map(numSemana => {
      const datosSemana = result.recordset.filter(r => r.Semana === numSemana);
      return {
        semana: numSemana,
        datos: datosSemana,
        promedios: calcularPromedios(datosSemana),
        editable: numSemana === semanas[semanas.length - 1] && datosSemana.some(d => d.Validacion === 2)
      };
    });

    res.json({ success: true, variedad, loteNombre, modulo, turno, subturno, semanas: semanasDatos });
  } catch (err) {
    console.error('❌ Error al obtener datos lote:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

async function actualizarRegistro(req, res) {
  try {
    const { id } = req.params;
    const datos = req.body;
    const pool = await getConnection();

    const camposEditables = [
      'AlturaPlanta', 'Botones', 'Flores', 'Cuajas', 'PreCuajas',
      'CuajaDeforme', 'CuajasDañoAlternaria', 'CuajaDañoProdi',
      'FrutoNivel1', 'FrutosQuemados', 'FrutosDeformes', 'DeformeLeve',
      'TipoAji', 'FormaAji', 'DañoAlternaria', 'DañoProdiplosis',
      'FrutosDescompuestos', 'DiametroMenor', 'DañoRoedores', 'DañoPajaros'
    ];

    const mapeoColumnas = {
      AlturaPlanta: 'AltPlant', Botones: 'N_bot', Flores: 'N_Flor',
      Cuajas: 'N_Cuajas', PreCuajas: 'N_PC', CuajaDeforme: 'N_CDeforP',
      CuajasDañoAlternaria: 'N_CDA', CuajaDañoProdi: 'N_CDP',
      FrutoNivel1: 'N_FrtN1', FrutosQuemados: 'N_FrtfQ',
      FrutosDeformes: 'N_FrtFMD', DeformeLeve: 'N_FrtDeforL',
      TipoAji: 'N_FrtTAPR', FormaAji: 'N_FrtFA',
      DañoAlternaria: 'N_FrtDA', DañoProdiplosis: 'N_FrtDP',
      FrutosDescompuestos: 'N_FrtDescomp', DiametroMenor: 'N_FrtDM',
      DañoRoedores: 'N_FrtDPR', DañoPajaros: 'N_FrtDPP'
    };

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
      return res.status(400).json({ success: false, error: 'No hay campos para actualizar' });
    }

    setClauses.push(`Validacion = 1`);

    await request.query(`
      UPDATE TBL_ProyeccionesPimiento
      SET ${setClauses.join(', ')}
      WHERE idtablamaestra = @id
    `);

    res.json({ success: true, message: 'Registro actualizado' });
  } catch (err) {
    console.error('❌ Error al actualizar registro:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

async function editarPromediosLote(req, res) {
  try {
    const { idLote } = req.params;
    const { promediosEditados, valoresMin, valoresMax } = req.body;

    console.log('📊 Editando promedios lote:', { idLote, campos: Object.keys(promediosEditados) });

    const pool = await getConnection();

    const semanaResult = await pool.request()
      .input('idLote', sql.Int, idLote)
      .query(`
        SELECT TOP 1 DATEPART(iso_week, Fecha) as UltimaSemana, YEAR(Fecha) as Anio
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        WHERE TBL.idLote = @idLote AND E.Evaluacion = 'Fenologia' AND TBL.Validacion != 0
        ORDER BY Fecha DESC
      `);

    const ultimaSemana = semanaResult.recordset[0]?.UltimaSemana;
    const anio = semanaResult.recordset[0]?.Anio;

    if (!ultimaSemana) {
      return res.status(404).json({ success: false, error: 'No se encontraron datos para este lote' });
    }

    const muestrasResult = await pool.request()
      .input('idLote', sql.Int, idLote)
      .input('semana', sql.Int, ultimaSemana)
      .input('anio', sql.Int, anio)
      .query(`
        SELECT idtablamaestra as id, Validacion
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        WHERE TBL.idLote = @idLote 
        AND E.Evaluacion = 'Fenologia'
        AND DATEPART(iso_week, Fecha) = @semana
        AND YEAR(Fecha) = @anio
        AND TBL.Validacion != 0
      `);

    const muestras = muestrasResult.recordset;

    if (muestras.length === 0) {
      return res.status(404).json({ success: false, error: 'No se encontraron muestras para actualizar' });
    }

    const mapeoColumnas = {
      AlturaPlanta: 'AltPlant', Botones: 'N_bot', Flores: 'N_Flor',
      Cuajas: 'N_Cuajas', PreCuajas: 'N_PC', CuajaDeforme: 'N_CDeforP',
      CuajasDañoAlternaria: 'N_CDA', CuajaDañoProdi: 'N_CDP',
      FrutoNivel1: 'N_FrtN1', FrutosQuemados: 'N_FrtfQ',
      FrutosDeformes: 'N_FrtFMD', DeformeLeve: 'N_FrtDeforL',
      TipoAji: 'N_FrtTAPR', FormaAji: 'N_FrtFA',
      DañoAlternaria: 'N_FrtDA', DañoProdiplosis: 'N_FrtDP',
      FrutosDescompuestos: 'N_FrtDescomp', DiametroMenor: 'N_FrtDM',
      DañoRoedores: 'N_FrtDPR', DañoPajaros: 'N_FrtDPP'
    };

    for (const campo of Object.keys(promediosEditados)) {
      const promedio = parseFloat(promediosEditados[campo]);
      const min = valoresMin && valoresMin[campo] ? parseFloat(valoresMin[campo]) : promedio * 0.7;
      const max = valoresMax && valoresMax[campo] ? parseFloat(valoresMax[campo]) : promedio * 1.3;

      const valoresDistribuidos = distribuirValores(muestras.length, promedio, min, max, campo === 'AlturaPlanta');
      const nombreColumna = mapeoColumnas[campo];
      const valoresParaUpdate = muestras.map((m, i) => `(${m.id}, ${valoresDistribuidos[i]})`).join(',');

      await pool.request().query(`
        UPDATE TBL_ProyeccionesPimiento
        SET ${nombreColumna} = v.valor, Validacion = 1
        FROM TBL_ProyeccionesPimiento t
        INNER JOIN (VALUES ${valoresParaUpdate}) AS v(id, valor)
          ON t.idtablamaestra = v.id
      `);

      console.log(`✅ ${campo}: Distribuido ${muestras.length} valores`);
    }

    res.json({ success: true, message: `Promedios actualizados en ${muestras.length} muestras` });
  } catch (err) {
    console.error('❌ Error al editar promedios lote:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

async function editarPromediosTurno(req, res) {
  try {
    const { idTurno } = req.params;
    const { promediosEditados, valoresMin, valoresMax } = req.body;

    console.log('📊 Editando turno:', idTurno);
    console.log('Promedios recibidos:', promediosEditados);

    const pool = await getConnection();

    // Obtener última semana y año
    const semanaGlobalResult = await pool.request()
      .input('idTurno', sql.Int, idTurno)
      .query(`
        SELECT TOP 1 DATEPART(iso_week, Fecha) as UltimaSemana, YEAR(Fecha) as Anio
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        INNER JOIN Lote L ON L.idLote = TBL.idLote
        WHERE L.idTurno = @idTurno AND E.Evaluacion = 'Fenologia' AND TBL.Validacion != 0
        ORDER BY Fecha DESC
      `);

    const ultimaSemana = semanaGlobalResult.recordset[0]?.UltimaSemana;
    const anio = semanaGlobalResult.recordset[0]?.Anio;

    if (!ultimaSemana) {
      return res.status(404).json({ success: false, error: 'No se encontraron datos' });
    }

    // Verificar si hay AlturaPlanta = 0
    const hayAlturaPlantaCero = Object.values(promediosEditados).some(val => 
      typeof val === 'object' && val.AlturaPlanta && parseFloat(val.AlturaPlanta) === 0
    );

    if (hayAlturaPlantaCero) {
      console.log('⚠️ AlturaPlanta = 0 detectado. Poniendo TODOS los lotes en 0...');
      
      await pool.request()
        .input('idTurno', sql.Int, idTurno)
        .input('semana', sql.Int, ultimaSemana)
        .input('anio', sql.Int, anio)
        .query(`
          UPDATE TBL_ProyeccionesPimiento
          SET AltPlant = 0, Validacion = 1
          WHERE idLote IN (SELECT idLote FROM Lote WHERE idTurno = @idTurno)
          AND IdEvaluacion IN (SELECT idEvaluacion FROM Evaluacion WHERE Evaluacion = 'Fenologia')
          AND DATEPART(iso_week, Fecha) = @semana
          AND YEAR(Fecha) = @anio
          AND Validacion != 0
        `);
      
      console.log(`✅ AlturaPlanta = 0 aplicado a TODOS los lotes`);
    }

    const mapeoColumnas = {
      AlturaPlanta: 'AltPlant', Botones: 'N_bot', Flores: 'N_Flor',
      Cuajas: 'N_Cuajas', PreCuajas: 'N_PC', CuajaDeforme: 'N_CDeforP',
      CuajasDañoAlternaria: 'N_CDA', CuajaDañoProdi: 'N_CDP',
      FrutoNivel1: 'N_FrtN1', FrutosQuemados: 'N_FrtfQ',
      FrutosDeformes: 'N_FrtFMD', DeformeLeve: 'N_FrtDeforL',
      TipoAji: 'N_FrtTAPR', FormaAji: 'N_FrtFA',
      DañoAlternaria: 'N_FrtDA', DañoProdiplosis: 'N_FrtDP',
      FrutosDescompuestos: 'N_FrtDescomp', DiametroMenor: 'N_FrtDM',
      DañoRoedores: 'N_FrtDPR', DañoPajaros: 'N_FrtDPP'
    };

    // Actualizar cada lote
    for (const [idLote, promLote] of Object.entries(promediosEditados)) {
      const muestrasResult = await pool.request()
        .input('idLote', sql.Int, parseInt(idLote))
        .input('semana', sql.Int, ultimaSemana)
        .input('anio', sql.Int, anio)
        .query(`
          SELECT idtablamaestra as id
          FROM TBL_ProyeccionesPimiento TBL
          INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
          WHERE TBL.idLote = @idLote 
          AND E.Evaluacion = 'Fenologia'
          AND DATEPART(iso_week, Fecha) = @semana
          AND YEAR(Fecha) = @anio
          AND TBL.Validacion != 0
        `);

      const muestras = muestrasResult.recordset;
      if (muestras.length === 0) continue;

      for (const [campo, promedio] of Object.entries(promLote)) {
        if (campo === 'AlturaPlanta' && hayAlturaPlantaCero) continue; // Ya procesado

        const prom = parseFloat(promedio);
        const min = valoresMin && valoresMin[campo] ? parseFloat(valoresMin[campo]) : prom * 0.7;
        const max = valoresMax && valoresMax[campo] ? parseFloat(valoresMax[campo]) : prom * 1.3;

        const valoresDistribuidos = distribuirValores(muestras.length, prom, min, max, campo === 'AlturaPlanta');
        const nombreColumna = mapeoColumnas[campo];
        const valoresParaUpdate = muestras.map((m, i) => `(${m.id}, ${valoresDistribuidos[i]})`).join(',');

        await pool.request().query(`
          UPDATE TBL_ProyeccionesPimiento
          SET ${nombreColumna} = v.valor, Validacion = 1
          FROM TBL_ProyeccionesPimiento t
          INNER JOIN (VALUES ${valoresParaUpdate}) AS v(id, valor)
            ON t.idtablamaestra = v.id
        `);
      }
    }

    // ASEGURAR que TODO el turno quede en Validación = 1
    await pool.request()
      .input('idTurno', sql.Int, idTurno)
      .input('semana', sql.Int, ultimaSemana)
      .input('anio', sql.Int, anio)
      .query(`
        UPDATE TBL_ProyeccionesPimiento WITH (ROWLOCK)
        SET Validacion = 1
        WHERE idLote IN (SELECT idLote FROM Lote WHERE idTurno = @idTurno)
        AND IdEvaluacion IN (SELECT idEvaluacion FROM Evaluacion WHERE Evaluacion = 'Fenologia')
        AND DATEPART(iso_week, Fecha) = @semana
        AND YEAR(Fecha) = @anio
        AND Validacion != 0
      `);

    console.log(`✅ TODO EL TURNO marcado como Validacion = 1`);

    res.json({ success: true, message: 'Turno actualizado correctamente' });
  } catch (err) {
    console.error('❌ Error al editar promedios turno:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

async function marcarTurnoRevisado(req, res) {
  try {
    const { idTurno } = req.params;
    const pool = await getConnection();

    const semanaResult = await pool.request()
      .input('idTurno', sql.Int, idTurno)
      .query(`
        SELECT TOP 1 DATEPART(iso_week, Fecha) as UltimaSemana, YEAR(Fecha) as Anio
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        INNER JOIN Lote L ON L.idLote = TBL.idLote
        WHERE L.idTurno = @idTurno AND E.Evaluacion = 'Fenologia' AND TBL.Validacion != 0
        ORDER BY Fecha DESC
      `);

    const ultimaSemana = semanaResult.recordset[0]?.UltimaSemana;
    const anio = semanaResult.recordset[0]?.Anio;

    if (!ultimaSemana) {
      return res.status(404).json({ success: false, error: 'No se encontraron datos' });
    }

    await pool.request()
      .input('idTurno', sql.Int, idTurno)
      .input('semana', sql.Int, ultimaSemana)
      .input('anio', sql.Int, anio)
      .query(`
        UPDATE TBL_ProyeccionesPimiento WITH (ROWLOCK)
        SET Validacion = 1
        WHERE idLote IN (SELECT idLote FROM Lote WHERE idTurno = @idTurno)
        AND IdEvaluacion IN (SELECT idEvaluacion FROM Evaluacion WHERE Evaluacion = 'Fenologia')
        AND DATEPART(iso_week, Fecha) = @semana
        AND YEAR(Fecha) = @anio
        AND Validacion != 0
      `);

    res.json({ success: true, message: 'Turno marcado como revisado' });
  } catch (err) {
    console.error('❌ Error al marcar turno revisado:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

function calcularPromedios(datos) {
  if (datos.length === 0) return {};

  const camposNumericos = [
    'AlturaPlanta', 'Botones', 'Flores', 'Cuajas', 'PreCuajas',
    'CuajaDeforme', 'CuajasDañoAlternaria', 'CuajaDañoProdi',
    'FrutoNivel1', 'FrutosQuemados', 'FrutosDeformes', 'DeformeLeve',
    'TipoAji', 'FormaAji', 'DañoAlternaria', 'DañoProdiplosis',
    'FrutosDescompuestos', 'DiametroMenor', 'DañoRoedores', 'DañoPajaros'
  ];

  const promedios = {};
  for (const campo of camposNumericos) {
    const valores = datos.map(d => d[campo]).filter(v => v !== null && v !== undefined && !isNaN(v));
    if (valores.length > 0) {
      const suma = valores.reduce((acc, val) => acc + parseFloat(val), 0);
      promedios[campo] = (suma / valores.length).toFixed(2);
    } else {
      promedios[campo] = '0.00';
    }
  }
  return promedios;
}

function distribuirValores(cantidad, promedio, min, max, esDecimal) {
  const valores = [];
  for (let i = 0; i < cantidad; i++) {
    const aleatorio = min + Math.random() * (max - min);
    valores.push(esDecimal ? Math.round(aleatorio * 10) / 10 : Math.round(aleatorio));
  }

  let sumaActual = valores.reduce((a, b) => a + b, 0);
  const sumaObjetivo = promedio * cantidad;
  let diferencia = sumaObjetivo - sumaActual;
  const ajuste = esDecimal ? 0.1 : 1;
  let intentos = 0;

  while (Math.abs(diferencia) > 0.01 && intentos < cantidad * 100) {
    const idx = Math.floor(Math.random() * cantidad);
    if (diferencia > 0 && valores[idx] + ajuste <= max) {
      valores[idx] = esDecimal ? Math.round((valores[idx] + ajuste) * 10) / 10 : valores[idx] + ajuste;
      diferencia -= ajuste;
    } else if (diferencia < 0 && valores[idx] - ajuste >= min) {
      valores[idx] = esDecimal ? Math.round((valores[idx] - ajuste) * 10) / 10 : valores[idx] - ajuste;
      diferencia += ajuste;
    }
    intentos++;
  }

  return valores.map(v => esDecimal ? Math.round(v * 10) / 10 : Math.round(v));
}


module.exports = {
  getFundos,
  getModulosByFundo,
  getTurnosByModulo,
  getDatosTurnoTresSemanas,
  getDatosLoteTresSemanas,
  actualizarRegistro,
  editarPromediosLote,
  editarPromediosTurno,
  marcarTurnoRevisado,
};