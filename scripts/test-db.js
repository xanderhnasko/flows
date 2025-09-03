const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function testDatabase() {
  try {
    const client = await pool.connect()
    
    // Test sites query
    const sites = await client.query('SELECT id, name, river, usgs_site_code FROM sites ORDER BY id')
    console.log('✅ Sites in database:')
    sites.rows.forEach(site => {
      console.log(`  ${site.id}: ${site.name} (${site.usgs_site_code}) - ${site.river}`)
    })
    
    // Test reservoirs query
    const reservoirs = await client.query('SELECT name, river FROM reservoirs ORDER BY id')
    console.log('\n✅ Reservoirs in database:')
    reservoirs.rows.forEach(reservoir => {
      console.log(`  ${reservoir.name} - ${reservoir.river}`)
    })
    
    client.release()
    console.log('\n✅ Database is ready for use!')
  } catch (error) {
    console.error('❌ Database test failed:', error.message)
  } finally {
    await pool.end()
  }
}

testDatabase()