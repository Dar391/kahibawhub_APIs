require('dotenv').config()
const express = require('express')
const cors = require('cors')
const app = express()
const PORT = 4000
const mongoose = require('mongoose')
const multer = require('multer')
const path = require('path')

//schemas
const RegisteredUsers = require('./src/schemas/schemaRegisteredUsers')
const UserProfile = require('./src/schemas/schemaUserProfile')
const Materials = require('./src/schemas/schemaMaterials')

//API routes
const CollaborationReq = require('./routes/collaborationsAPI')
const UserInteractions = require('./routes/userInteractionsAPI')
const MaterialTransactions = require('./routes/materialTransactionsAPI')
const UserProfiling = require('./routes/userProfilingAPI')
const AuthAPI = require('./routes/authAPI')
const BrowsingAPI = require('./routes/browsingAPI')
const openMaterialAPI = require('./routes/openMaterialAPI')
const engagementsAPI = require('./routes/engagementsAPI')
const rankingAPI = require('./routes/rankingAPI')
const addingMaterialAPI = require('./routes/addingMaterialAPI')
require('dotenv').config()

mongoose
  .connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 20000,
  })
  .then(() => {
    console.log('Connected to MongoDB')
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`)
    })
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB', err)
    process.exit(1)
  })

app.use(express.json())

const storage = multer.memoryStorage()
const upload = multer({ storage: storage })

app.use(
  cors({
    origin: ['http://localhost:4001', 'http://localhost:4000'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
)

app.get('/getAnalytics', async (req, res) => {
  try {
    const totalUsers = await RegisteredUsers.countDocuments()
    const totalMaterials = await Materials.countDocuments()

    const totalReadsResult = await Materials.aggregate([
      { $group: { _id: null, totalReads: { $sum: '$totalReads' } } },
    ])
    const totalReads =
      totalReadsResult.length > 0 ? totalReadsResult[0].totalReads : 0

    const institutions = await UserProfile.distinct('primaryInstitution', {
      primaryInstitution: { $ne: null, $ne: '' },
    })
    const totalInstitutions = institutions.length

    res.json({
      totalUsers,
      totalMaterials,
      totalReads,
      totalInstitutions,
    })
  } catch (error) {}
})

app.use(
  '/assets/SystemImages',
  express.static(path.join(__dirname, 'src', 'assets', 'SystemImages'))
)

app.use('/apiAuthentication', AuthAPI)
app.use('/apiCollaborations', CollaborationReq)
app.use('/apiUserInteractions', UserInteractions)
app.use('/apiMaterialTransactions', MaterialTransactions)
app.use('/apiUserProfiling', UserProfiling)
app.use('/apiBrowsing', BrowsingAPI)
app.use('/apiOpenMaterial', openMaterialAPI)
app.use('/apiEngagements', engagementsAPI)
app.use('/apiRanking', rankingAPI)
app.use('/apiAddMaterial', addingMaterialAPI)
