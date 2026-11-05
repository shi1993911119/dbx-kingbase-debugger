CREATE FUNCTION demo_user.dbx_debug_modes_func_20261104(p_seed IN integer, p_result OUT integer, p_total INOUT integer) RETURN integer AS
BEGIN
    p_result := p_seed * 3;
    p_total := COALESCE(p_total, 0) + p_seed;
    RETURN p_result + p_total;
END;
