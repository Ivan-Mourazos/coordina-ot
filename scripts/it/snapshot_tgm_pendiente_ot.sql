-- ─── Snapshot de TGM_PENDIENTE_OT (para IT) ──────────────────────────────────
-- La vista dbo.TGM_PENDIENTE_OT tarda 7-15 s. Este script crea una tabla
-- espejo y un procedimiento para refrescarla; programado con SQL Agent cada
-- 5-10 min, CoordinaOT pasaría a leer la tabla (milisegundos) en vez de la
-- vista. NO modifica nada de RPS: solo AÑADE una tabla y un procedimiento
-- nuevos en RPSNext.
--
-- Después de crearlo, avisad a Iván para cambiar la consulta de la app
-- (una línea: FROM dbo.TGM_PENDIENTE_OT → FROM dbo.TGM_PENDIENTE_OT_SNAP).

USE RPSNext;
GO

-- 1) Tabla espejo (misma forma que la vista)
IF OBJECT_ID('dbo.TGM_PENDIENTE_OT_SNAP', 'U') IS NULL
BEGIN
    SELECT TOP 0 *, SYSDATETIME() AS SnapshotAt
    INTO dbo.TGM_PENDIENTE_OT_SNAP
    FROM dbo.TGM_PENDIENTE_OT;
END
GO

-- 2) Procedimiento de refresco (swap atómico dentro de transacción)
CREATE OR ALTER PROCEDURE dbo.RefrescarSnapshotPendienteOT
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;
            DELETE FROM dbo.TGM_PENDIENTE_OT_SNAP;
            INSERT INTO dbo.TGM_PENDIENTE_OT_SNAP
            SELECT *, SYSDATETIME() FROM dbo.TGM_PENDIENTE_OT;
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

-- 3) Permiso de lectura para el usuario de la app
GRANT SELECT ON dbo.TGM_PENDIENTE_OT_SNAP TO lectura;
GO

-- 4) Programar en SQL Agent (ajustad nombre/planificación a vuestro estándar):
--    Job "CoordinaOT - snapshot pendiente OT"
--    Paso: EXEC RPSNext.dbo.RefrescarSnapshotPendienteOT;
--    Planificación: cada 5 minutos, en horario laboral (p. ej. 06:00-20:00).
