import db from './db.server'

export interface CurrentUser {
  id: number
  externalId: string
}

// Replace only this seam with Clerk session lookup when authentication arrives.
export function getCurrentUser(): CurrentUser {
  const row = db.prepare(`
    INSERT INTO users (external_id, display_name) VALUES ('local', 'Local User')
    ON CONFLICT(external_id) DO UPDATE SET external_id = excluded.external_id
    RETURNING id, external_id AS externalId
  `).get() as CurrentUser
  return row
}
