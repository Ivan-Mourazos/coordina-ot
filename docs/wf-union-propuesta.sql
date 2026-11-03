WITH asignar AS (           -- el paso «para coger»: uno por solicitud
  SELECT t.WorkflowInstanceID, t.CreationTimestamp, CAST(t.CreationTimestamp AS date) AS Dia,
         t.RowCreatedBy AS Comercial, t.AssignedUser, a.CodRole
    FROM BPMTask t
    JOIN BPMWorkflow w ON w.IDWorkflow = t.IDWorkflow
    JOIN BPMTaskAssignation a ON a.IDTask = t.IDTask
   WHERE t.CodCompany = '001'   -- el índice por ejecución empieza por la empresa
     AND w.Description = 'SOLICITAR BOCETO O INFORMACION'
     AND t.Description LIKE 'Formulario asignar trabajo%'
     AND a.CodRole IN ('OT','DISEÑO')
     AND t.CreationDate >= DATEADD(day, -180, CAST(GETDATE() AS date))   -- Coordina no necesita más
), tecnico AS (            -- el paso del técnico, solo de esas solicitudes
  SELECT t.WorkflowInstanceID, t.AssignedUser, t.CreationTimestamp AS Desde,
         ISNULL((SELECT MIN(x.CreationTimestamp) FROM BPMTask x
                  WHERE x.CodCompany = '001' AND x.WorkflowInstanceID = t.WorkflowInstanceID AND x.CreationTimestamp > t.CreationTimestamp), GETDATE()) AS Hasta
    FROM BPMTask t
    JOIN asignar s ON t.CodCompany = '001' AND s.WorkflowInstanceID = t.WorkflowInstanceID
   WHERE t.Description LIKE 'Formulario tecnico%'
)
SELECT s.WorkflowInstanceID, tr.State AS EstadoWF, s.CodRole AS Rol,
       com.CodActivity AS ActividadComercial, com.CodUser AS Comercial, com.Description AS DescripcionActividad,
       com.Comment AS ComentarioComercial, com.CreationDate AS FechaCreacion,
       tec.CodActivity AS ActividadTecnico, tec.CodUser AS Tecnico, tec.Comment AS ComentarioTecnico,
       tec.EndDate AS FechaRealizacion,
       ISNULL(s.AssignedUser, tec.CodUser) AS TecnicoAsignado
  FROM asignar s
  -- RPS borra el seguimiento de la mayoría de las terminadas: solo informa, no filtra
  LEFT JOIN BPMWorkflowTracking tr ON tr.WorkflowInstanceID = s.WorkflowInstanceID
  OUTER APPLY (SELECT TOP 1 c.* FROM FACActivitySL c
                WHERE c.CodCompany = '001' AND c.CodUser = s.Comercial
                  AND c.CreationDate = s.Dia                    -- por día primero: deja usar el índice
                  AND c.Description LIKE '%solicitud%'
                  AND c.CreationTimestamp BETWEEN DATEADD(second, -60, s.CreationTimestamp) AND DATEADD(second, 60, s.CreationTimestamp)
                ORDER BY ABS(DATEDIFF(millisecond, c.CreationTimestamp, s.CreationTimestamp))) com
  OUTER APPLY (SELECT TOP 1 c.* FROM tecnico tt
                JOIN FACActivitySL c ON c.CodCompany = '001' AND c.IDOportunity = com.IDOportunity
                 AND c.Description LIKE '%a realizar%' AND c.CodUser = tt.AssignedUser
                 AND c.CreationTimestamp BETWEEN DATEADD(second, -60, tt.Desde) AND DATEADD(second, 60, tt.Hasta)
                WHERE tt.WorkflowInstanceID = s.WorkflowInstanceID
                ORDER BY c.CreationTimestamp DESC) tec
