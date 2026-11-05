CREATE PROCEDURE demo_user.dbx_debug_cursor_out_probe_20261104(
    p_seed IN integer,
    output_cursor OUT "demo_user"."demo_cursor.t_cursor",
    p_empty OUT refcursor,
    p_null OUT refcursor,
    p_second OUT refcursor,
    p_total INOUT integer
) AS
BEGIN
    OPEN output_cursor FOR
        SELECT p_seed AS "Seed", 9223372036854775807::bigint AS "big_value",
               NULL::varchar AS "nullable", '<img src=x>'::varchar AS "text_value",
               1 AS "Same", 2 AS "Same", 3 AS "same";
    OPEN p_empty FOR SELECT 1 AS "EmptyColumn" WHERE 1=0;
    p_null := NULL;
    OPEN p_second FOR SELECT 'cursor-out-ok'::varchar AS "status";
    p_total := COALESCE(p_total, 0) + p_seed;
END;
