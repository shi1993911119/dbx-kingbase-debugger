DECLARE
    v_result integer := NULL;
    v_total integer := 20;
    v_note varchar := NULL;
BEGIN
    CALL demo_user.dbx_debug_modes_probe_20261104(v_result, 7, v_total, v_note);
    IF v_result IS DISTINCT FROM 14 OR v_total IS DISTINCT FROM 27 OR v_note IS DISTINCT FROM 'modes-ok' THEN
        RAISE EXCEPTION 'DBX modes probe failed';
    END IF;
END;
