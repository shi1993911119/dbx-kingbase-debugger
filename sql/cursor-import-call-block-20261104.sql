-- Paste into the plugin's “粘贴调用文本” dialog. Uses only the existing independent probe.
DECLARE
    v_seed INTEGER;
    v_total INTEGER;
    list demo_cursor.T_CURSOR;
    c_empty REFCURSOR;
    c_null REFCURSOR;
    c_second REFCURSOR;
BEGIN
    v_seed := 7;
    v_total := 20;
    demo_user.dbx_debug_cursor_out_probe_20261104(
        v_seed, list, c_empty, c_null, c_second, v_total);
    DBMS_OUTPUT.PUT_LINE('total=' || v_total);
END;
