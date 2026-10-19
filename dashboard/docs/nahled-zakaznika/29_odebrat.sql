-- ODEBRÁNÍ oprávnění customer_card_preview jednomu uživateli (podle user_id).
-- Doplňte <USER_ID> a <KDO_ODEBIRA> (user_id toho, kdo odebírá). Platí
-- okamžitě (tlačítko zmizí, náhled vrací 404). Historie udělení zůstává.
UPDATE user_permissions
SET revoked_at = now(), revoked_by_user_id = '<KDO_ODEBIRA>'
WHERE user_id = '<USER_ID>' AND permission = 'customer_card_preview' AND revoked_at IS NULL
RETURNING user_id, granted_at, revoked_at;
