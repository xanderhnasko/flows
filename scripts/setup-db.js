const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

require('dotenv').config()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function setupDatabase() {
  try {
    console.log('Testing database connection...')
    const client = await pool.connect()
    console.log('✅ Database connected successfully!')
    
    // Read and execute schema
    const schemaPath = path.join(__dirname, '../database/schema.sql')
    const schema = fs.readFileSync(schemaPath, 'utf8')
    
    console.log('Creating database schema...')
    await client.query(schema)
    console.log('✅ Schema created successfully!')
    
    // Read and execute seeds
    const seedsPath = path.join(__dirname, '../database/seeds/sites.sql')
    const seeds = fs.readFileSync(seedsPath, 'utf8')
    
    console.log('Seeding initial site data...')
    await client.query(seeds)
    console.log('✅ Sites seeded successfully!')
    
    // Verify data
    const result = await client.query('SELECT COUNT(*) FROM sites')
    console.log(`✅ Created ${result.rows[0].count} sites`)
    
    client.release()
  } catch (error) {
    console.error('❌ Database setup failed:', error.message)
  } finally {
    await pool.end()
  }
}

setupDatabase()