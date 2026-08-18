import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import admin from 'firebase-admin'
import { readFileSync } from 'fs'
import classifyRouter from './routes/classify.js'
import reportsRouter from './routes/reports.js'

// Initialize Firebase Admin
let firebaseInitialized = false

try {
  let serviceAccount
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.SERVICE_ACCOUNT_KEY || process.env.FIREBASE_CONFIG_JSON
  
  if (rawServiceAccount) {
    try {
      serviceAccount = typeof rawServiceAccount === 'string' ? JSON.parse(rawServiceAccount) : rawServiceAccount
    } catch {
      // Try base64 decoding if raw JSON parse fails
      const decoded = Buffer.from(rawServiceAccount, 'base64').toString('utf8')
      serviceAccount = JSON.parse(decoded)
    }
  } else {
    const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json'
    serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))
  }

  if (serviceAccount && serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  })
  firebaseInitialized = true
} catch (err) {
  console.warn('⚠️  Firebase Admin SDK not initialized:', err.message)
  console.warn('   Provide FIREBASE_SERVICE_ACCOUNT env var or place serviceAccountKey.json in /server')
  console.warn('   Download it from: Firebase Console → Project Settings → Service Accounts')
}

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  process.env.CLIENT_URL,
].filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true)
    } else {
      callback(null, true) // permissive fallback for deployment
    }
  },
  credentials: true,
}))
app.use(express.json({ limit: '20mb' }))

// Root welcome route
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: '🏛️ CivicSense AI Backend API is live and running.',
    endpoints: {
      health: '/api/health',
      classify: '/api/classify',
      seed: '/api/seed',
    },
    timestamp: new Date().toISOString(),
  })
})

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CivicSense AI Backend',
    timestamp: new Date().toISOString(),
    env: {
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      firebaseAdmin: firebaseInitialized,
    },
  })
})

// Seed endpoint to populate sample reports into Firestore
app.get('/api/seed', async (req, res) => {
  if (!firebaseInitialized) {
    return res.status(500).json({ error: 'Firebase Admin not initialized' })
  }

  try {
    const db = admin.firestore()
    const sampleReports = [
      {
        user_id: 'seed-user-1',
        category: 'Pothole',
        description: 'Deep pothole on Main Street near central intersection causing severe traffic congestion.',
        image_url: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80',
        latitude: 28.6139,
        longitude: 77.2090,
        status: 'pending',
        severity: 'high',
        upvotes: 14,
        created_at: admin.firestore.Timestamp.now(),
      },
      {
        user_id: 'seed-user-2',
        category: 'Garbage/Waste Overflow',
        description: 'Overflowing community garbage bin attracting pests and blocking pedestrian walkway.',
        image_url: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=800&q=80',
        latitude: 28.6190,
        longitude: 77.2150,
        status: 'verified',
        severity: 'medium',
        upvotes: 8,
        created_at: admin.firestore.Timestamp.now(),
      },
      {
        user_id: 'seed-user-3',
        category: 'Water Leakage',
        description: 'Major underground pipe burst spilling drinking water onto public road.',
        image_url: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80',
        latitude: 28.6080,
        longitude: 77.2200,
        status: 'in-progress',
        severity: 'high',
        upvotes: 22,
        created_at: admin.firestore.Timestamp.now(),
      },
      {
        user_id: 'seed-user-4',
        category: 'Damaged Infrastructure',
        description: 'Broken street lights along the pedestrian walkway causing safety concerns at night.',
        image_url: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=800&q=80',
        latitude: 28.6250,
        longitude: 77.2000,
        status: 'resolved',
        severity: 'low',
        upvotes: 5,
        created_at: admin.firestore.Timestamp.now(),
      },
      {
        user_id: 'seed-user-5',
        category: 'Pothole',
        description: 'Dangerous road crater near school zone requiring urgent repair.',
        image_url: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80',
        latitude: 28.6000,
        longitude: 77.2100,
        status: 'pending',
        severity: 'high',
        upvotes: 11,
        created_at: admin.firestore.Timestamp.now(),
      },
    ]

    const added = []
    for (const report of sampleReports) {
      const docRef = await db.collection('reports').add(report)
      added.push({ id: docRef.id, category: report.category })
    }

    res.json({ message: 'Database seeded successfully!', addedCount: added.length, reports: added })
  } catch (err) {
    console.error('Seed error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Routes
app.use('/api', classifyRouter)
app.use('/api', reportsRouter)

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏛️  CivicSense AI Backend running on http://0.0.0.0:${PORT}`)
  console.log(`   Health: http://0.0.0.0:${PORT}/api/health`)
  console.log(`   Gemini API Key: ${process.env.GEMINI_API_KEY ? '✅ configured' : '❌ missing'}`)
  console.log(`   Firebase Admin: ${firebaseInitialized ? '✅ initialized' : '❌ not initialized'}\n`)
})
