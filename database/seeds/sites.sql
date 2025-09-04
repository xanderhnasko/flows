-- New Mexico Stream Monitoring Sites
-- Minimal seeds - all metadata populated dynamically via USGS API

-- Core monitoring sites (just site codes - all other data fetched automatically)
INSERT INTO sites (usgs_site_code, active) VALUES
-- Original Tier 1 & 2 sites
('09355500', TRUE), -- San Juan River Near Archuleta, NM
('08279500', TRUE), -- Rio Grande at Embudo
('08317400', TRUE), -- Rio Grande below Cochiti Dam
('08378500', TRUE), -- Pecos River near Pecos
('08290000', TRUE), -- Rio Chama near Chamita
('08313000', TRUE), -- Rio Grande at Otowi Bridge
('08265000', TRUE), -- Red River near Questa

-- Additional New Mexico sites
('08377900', TRUE), -- Rio Mora Near Terrero, NM
('08276500', TRUE), -- Rio Grande Blw Taos Junction Bridge Near Taos, NM
('08287000', TRUE), -- Rio Chama Below Abiquiu Dam, NM
('08263500', TRUE), -- Rio Grande Near Cerro, NM
('08266820', TRUE), -- Red River Below Fish Hatchery, Near Questa, NM
('08281400', TRUE), -- Rio Chama Above Chama, NM
('08282300', TRUE), -- Rio Brazos at Fishtail Road NR Tierra Amarilla, NM
('08285500', TRUE), -- Rio Chama Below EL Vado Dam, NM
('08284100', TRUE), -- Rio Chama Near LA Puente, NM
('08286500', TRUE), -- Rio Chama Above Abiquiu Reservoir, NM
('07203000', TRUE), -- Vermejo River Near Dawson, NM
('07211500', TRUE), -- Canadian River Near Taylor Springs, NM
('08276300', TRUE), -- Rio Pueblo DE Taos Below Los Cordovas, NM
('08254000', TRUE), -- Costilla Creek Below Costilla Dam, NM
('08252500', TRUE), -- Costilla Creek Above Costilla Dam, NM
('09364500', TRUE), -- Animas River at Farmington, NM
('09365000', TRUE), -- San Juan River at Farmington, NM
('09367500', TRUE), -- LA Plata River Near Farmington, NM
('09367000', TRUE), -- LA Plata River at LA Plata, NM
('09368000', TRUE), -- San Juan River at Shiprock, NM
('093710009', TRUE), -- Mancos River NR Four Corners, CO
('09364010', TRUE); -- Animas River Below Aztec, NM

-- Associated Reservoirs
INSERT INTO reservoirs (name, river, rise_location_id, associated_site_id) VALUES
('Navajo Dam', 'San Juan River', 'NAV', (SELECT id FROM sites WHERE usgs_site_code = '09355500')),
('El Vado', 'Rio Chama', 'ELV', (SELECT id FROM sites WHERE usgs_site_code = '08290000')),
('Abiquiu', 'Rio Chama', 'ABQ', (SELECT id FROM sites WHERE usgs_site_code = '08290000')),
('Cochiti', 'Rio Grande', 'COC', (SELECT id FROM sites WHERE usgs_site_code = '08317400'));