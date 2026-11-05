CREATE FUNCTION demo_user.dbx_debug_cursor_func_20261104 RETURN "demo_user"."demo_cursor.t_cursor" AS
    result_cursor "demo_user"."demo_cursor.t_cursor";
BEGIN
    OPEN result_cursor FOR SELECT 'cursor-return-ok'::varchar AS "status";
    RETURN result_cursor;
END;
