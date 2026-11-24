-- 147: Faktury Elišky Kubíkové 20260145 (6 212 Kč) a 20260138 (758 Kč)
-- v archivu iDokladu označit jako uhrazené (Lucie 24. 11. 2026).
-- Datum úhrady = den splatnosti (skutečné datum platby neznáme).
-- Spouštět v Neon → SQL Editor → větev main → Run.
DO $$
BEGIN
  IF current_setting('neon.timeline_id', true) IS DISTINCT FROM '70a96b3677653646e65343cae8e27182' THEN
    RAISE EXCEPTION 'Špatná větev – spouštěj na main.';
  END IF;
END $$;

UPDATE idoklad_archive
SET payment = 'paid',
    paid_date = due_date,
    paid_kc = total_kc,
    raw = jsonb_set(jsonb_set(jsonb_set(raw,
            '{PaymentStatus}', '1'::jsonb),
            '{DateOfPayment}', to_jsonb(to_char(due_date, 'YYYY-MM-DD') || 'T00:00:00')),
            '{Prices,TotalPaid}', to_jsonb(total_kc)),
    updated_at = now()
WHERE doc_kind = 'invoice'
  AND number IN ('20260145', '20260138')
  AND payment <> 'paid'
RETURNING number, paid_date, paid_kc;
