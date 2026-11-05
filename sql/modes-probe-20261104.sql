CREATE PROCEDURE demo_user.dbx_debug_modes_probe_20261104(p_result OUT integer, p_seed IN integer, p_total INOUT integer, p_note OUT varchar) AS
BEGIN
    p_result := p_seed * 2;
    p_total := COALESCE(p_total, 0) + p_seed;
    p_note := 'modes-ok';
END;
