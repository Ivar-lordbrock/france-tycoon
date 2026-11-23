-- =====================================================================
-- France Tycoon — migration 010 : grades de l'équipe (dashboard /admin, 23/11/2026)
-- Modérateurs et admins nommés depuis le dashboard. Les comptes de ADMIN_EMAILS (réglages du
-- serveur) sont admin d'office et n'ont pas de ligne ici : on ne peut pas les rétrograder.
-- Table à part : `users.role` a un CHECK ('player', 'admin') qu'on ne peut changer sans reconstruire `users`.
-- =====================================================================

CREATE TABLE IF NOT EXISTS staff_roles (
  user_id     INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  role        TEXT    NOT NULL CHECK (role IN ('moderator', 'admin')),
  granted_by  INTEGER REFERENCES users (id) ON DELETE SET NULL,
  granted_at  INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
