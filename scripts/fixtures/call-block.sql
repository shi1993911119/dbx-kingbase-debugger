-- Synthetic 32-parameter fixture; all names, identifiers and values are fictional.
DECLARE
    input_user VARCHAR2(1024);
    input_group VARCHAR2(1024);
    input_action VARCHAR2(1024);
    input_id_1 VARCHAR2(1024);
    input_id_2 VARCHAR2(1024);
    input_id_3 VARCHAR2(1024);
    input_date_label VARCHAR2(1024);
    input_start_date VARCHAR2(1024);
    input_end_date VARCHAR2(1024);
    input_text_10 VARCHAR2(1024);
    input_text_11 VARCHAR2(1024);
    input_text_12 VARCHAR2(1024);
    input_text_13 VARCHAR2(1024);
    input_text_14 VARCHAR2(1024);
    input_text_15 VARCHAR2(1024);
    input_text_16 VARCHAR2(1024);
    input_text_17 VARCHAR2(1024);
    input_text_18 VARCHAR2(1024);
    input_text_19 VARCHAR2(1024);
    input_text_20 VARCHAR2(1024);
    input_text_21 VARCHAR2(1024);
    input_text_22 VARCHAR2(1024);
    input_text_23 VARCHAR2(1024);
    input_text_24 VARCHAR2(1024);
    input_text_25 VARCHAR2(1024);
    input_text_26 VARCHAR2(1024);
    input_text_27 VARCHAR2(1024);
    input_text_28 VARCHAR2(1024);
    input_text_29 VARCHAR2(1024);
    output_code INT;
    output_message VARCHAR2(1024);
    list demo_cursor.T_CURSOR;
BEGIN
    input_user := 'demo_user';
    input_group := 'DEMO';
    input_action := 'demo.reports.list';
    input_id_1 := '11111111-1111-1111-1111-111111111111';
    input_id_2 := '22222222-2222-2222-2222-222222222222';
    input_id_3 := '33333333-3333-3333-3333-333333333333';
    input_date_label := '测试日期';
    input_start_date := '2000-01-01';
    input_end_date := '2000-01-31';
    input_text_10 := '';
    input_text_11 := '';
    input_text_12 := '';
    input_text_13 := '';
    input_text_14 := '';
    input_text_15 := '';
    input_text_16 := '';
    input_text_17 := '';
    input_text_18 := '';
    input_text_19 := '';
    input_text_20 := '';
    input_text_21 := '';
    input_text_22 := '';
    input_text_23 := '';
    input_text_24 := '';
    input_text_25 := '';
    input_text_26 := '';
    input_text_27 := '';
    input_text_28 := '';
    input_text_29 := '';
    output_code := 0;
    output_message := '';
    list := null;
    demo_import_probe(
        input_user, input_group, input_action, input_id_1, input_id_2, input_id_3,
        input_date_label, input_start_date, input_end_date, input_text_10, input_text_11, input_text_12, input_text_13,
        input_text_14, input_text_15, input_text_16, input_text_17, input_text_18, input_text_19,
        input_text_20, input_text_21, input_text_22, input_text_23, input_text_24, input_text_25, input_text_26,
        input_text_27, input_text_28, input_text_29, output_code, output_message, list);
    DBMS_OUTPUT.PUT_LINE('output_code:' || output_code);
    DBMS_OUTPUT.PUT_LINE('output_message:' || output_message);
END;
