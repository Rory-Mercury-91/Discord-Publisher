-- Liens scan additionnels (plateformes alternatives illimitées)
ALTER TABLE work_publications
  ADD COLUMN IF NOT EXISTS additional_scan_links jsonb;

COMMENT ON COLUMN work_publications.additional_scan_links IS
  'Liens scan/alternatifs additionnels : [{ "label": "...", "link": "..." }, ...]';
