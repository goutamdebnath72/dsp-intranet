-- cleanup/check-cld-roster.sql -- READ-ONLY. Does the HR roster agree with the CL&D list (CL&D Online - Contacts, printed 26 Oct 2026)?
-- The list has 32 people in five sections: L & D (EXE-00107) 7, L & D OFFICE (09001) 13, L & D (09003) 1, L & D TECH (10770) 3, L & D IND (09008) 8.
-- The roster is a snapshot of 26 Sep 2026, the list is a month newer: a person who moved, joined or left since can show up here. That is information, not an error.
-- Run the sections ONE AT A TIME in the Supabase SQL editor (it shows only the last result).

-- ============ SECTION 1: the people of the roster in the five L & D rows: how many per row (expect 7, 13, 1, 3, 8 if the roster agrees)
SELECT department_code, department, count(*) AS people,
       count(*) FILTER (WHERE cohort = 'executive') AS executives
FROM nlq.employees
WHERE department_code IN (107, 9001, 9003, 10770, 9008)
GROUP BY department_code, department
ORDER BY department_code;

-- ============ SECTION 2: the differences, person by person (expect NO ROWS if the roster and the list agree)
WITH list(ticket, code_in_list, name_in_list) AS (VALUES
    ('490164', 107, 'PRADEEP BHARATHAN'),
    ('498933', 107, 'GEETANJALI ADHIKARI'),
    ('499269', 107, 'MAREM MERINO MARING'),
    ('440459', 107, 'TARUN KR BANERJEE'),
    ('499728', 107, 'PRACHEE PARWANEE'),
    ('442410', 107, 'SANDIP MAHATO'),
    ('442691', 107, 'MOHAN KUMAR DAS'),
    ('140124', 9001, 'H S SINGH'),
    ('153018', 9001, 'MRINMOYEE MUKHERJEE'),
    ('140191', 9001, 'SUMIT RANJAN DAS'),
    ('140576', 9001, 'AMAL KUMAR SAHA'),
    ('153031', 9001, 'SUMANA CHATTERJEE'),
    ('142188', 9001, 'RAJESH BANERJEE'),
    ('153357', 9001, 'KRISHNA PADA SHYAM'),
    ('142994', 9001, 'SUBHASISH PAKIRA'),
    ('153355', 9001, 'THAKURDAS KUNDU'),
    ('135001', 9001, 'MANOJ KUMAR BARI'),
    ('135006', 9001, 'NIRMALYA KR DUTTA'),
    ('153069', 9001, 'ANIL BOURI'),
    ('122663', 9001, 'PRATIMA MANDI'),
    ('140590', 9003, 'SANTIMOY ROY'),
    ('366837', 10770, 'KOUSHIK GHOSH'),
    ('367239', 10770, 'TRIPTI KUNDU'),
    ('367274', 10770, 'SNEHA GHOSH'),
    ('341556', 9008, 'UTTAM MUKHERJEE'),
    ('366589', 9008, 'MAYADHAR DAS'),
    ('345047', 9008, 'SUKHOMOY BAURI'),
    ('335013', 9008, 'KUMAR SANTOSH CHANDRA RANJAN'),
    ('366163', 9008, 'SOVA MISHRA'),
    ('366162', 9008, 'MITA TEWARI'),
    ('367147', 9008, 'SHIBASIS BANERJEE'),
    ('367450', 9008, 'ROOPKATHA BHOWMICK')
),
roster AS (SELECT ticket_no, name, department_code, department FROM nlq.employees),
in_list AS (
  SELECT 'in the CL&D list, but the roster has him or her elsewhere or not at all' AS what,
         l.ticket, l.name_in_list, l.code_in_list, r.name AS name_in_roster, r.department_code AS code_in_roster, r.department AS department_in_roster
  FROM list l LEFT JOIN roster r ON r.ticket_no = l.ticket
  WHERE r.ticket_no IS NULL OR r.department_code <> l.code_in_list
),
not_in_list AS (
  SELECT 'in the roster''s L & D rows, but NOT in the CL&D list' AS what,
         r.ticket_no, NULL::text, NULL::int, r.name, r.department_code, r.department
  FROM roster r
  WHERE r.department_code IN (107, 9001, 9003, 10770, 9008) AND r.ticket_no NOT IN (SELECT ticket FROM list)
)
SELECT * FROM in_list UNION ALL SELECT * FROM not_in_list ORDER BY 1, 2;
