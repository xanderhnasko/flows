-- New Mexico Priority Sites Data
-- Based on plan.MD Tier 1 and Tier 2 sites

-- Tier 1 - Must Have Sites
INSERT INTO sites (usgs_site_code, name, river, latitude, longitude, timezone, has_turbidity, has_ph, has_do, active) VALUES
('09355500', 'San Juan River below Navajo Dam', 'San Juan River', 36.8139, -107.6181, 'America/Denver', TRUE, FALSE, FALSE, TRUE),
('08279500', 'Rio Grande at Embudo', 'Rio Grande', 36.2072, -105.9636, 'America/Denver', TRUE, FALSE, FALSE, TRUE),
('08317400', 'Rio Grande below Cochiti Dam', 'Rio Grande', 35.6169, -106.3181, 'America/Denver', TRUE, FALSE, FALSE, TRUE),
('08378500', 'Pecos River near Pecos', 'Pecos River', 35.7039, -105.6778, 'America/Denver', FALSE, FALSE, FALSE, TRUE);

-- Tier 2 - High Value Sites  
INSERT INTO sites (usgs_site_code, name, river, latitude, longitude, timezone, has_turbidity, has_ph, has_do, active) VALUES
('08290000', 'Rio Chama near Chamita', 'Rio Chama', 36.0719, -106.1139, 'America/Denver', TRUE, FALSE, FALSE, TRUE),
('08313000', 'Rio Grande at Otowi Bridge', 'Rio Grande', 35.8772, -106.1328, 'America/Denver', TRUE, FALSE, FALSE, TRUE),
('07211500', 'Cimarron River near Cimarron', 'Cimarron River', 36.5139, -104.9361, 'America/Denver', FALSE, FALSE, FALSE, TRUE),
('08265000', 'Red River near Questa', 'Red River', 36.7042, -105.5492, 'America/Denver', FALSE, FALSE, FALSE, TRUE);

-- Associated Reservoirs
INSERT INTO reservoirs (name, river, rise_location_id, associated_site_id) VALUES
('Navajo Dam', 'San Juan River', 'NAV', (SELECT id FROM sites WHERE usgs_site_code = '09355500')),
('El Vado', 'Rio Chama', 'ELV', (SELECT id FROM sites WHERE usgs_site_code = '08290000')),
('Abiquiu', 'Rio Chama', 'ABQ', (SELECT id FROM sites WHERE usgs_site_code = '08290000')),
('Cochiti', 'Rio Grande', 'COC', (SELECT id FROM sites WHERE usgs_site_code = '08317400'));