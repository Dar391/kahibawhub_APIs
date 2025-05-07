const express = require('express')
const router = express.Router()
const multer = require('multer')
const mongoose = require('mongoose')
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const crypto = require('crypto')

const Materials = require('../src/schemas/schemaMaterials')
const schemaAccessedMaterial = require('../src/schemas/schemaReadingLists')
const pendingCollabRequest = require('../src/schemas/schemaPendingCollabRequests')
const collaborationsRequestSchema = require('../src/schemas/schemaCollaborationRequests')
const UserProfile = require('../src/schemas/schemaUserProfile')
const MaterialUpdateRequest = require('../src/schemas/schemaSendMaterialUpdateRequest')
const pendingMaterialUpdateReq = require('../src/schemas/schemaPendingMaterialRequests')
const updatedMaterials = require('../src/schemas/schemaUpdatedMaterial')
const Comments = require('../src/schemas/schemaMaterialComments')
const Ratings = require('../src/schemas/schemaMaterialRatings')
const ReadingLists = require('../src/schemas/schemaReadingLists')
const RegisteredUsers = require('../src/schemas/schemaRegisteredUsers')
require('dotenv').config()

//contract requirements
const materialContractAddress = process.env.TRANS_MATERIAL_CONTRACT_ADDRESS
const abi = require('../artifacts/Contracts/contracts/MaterialRegistry.sol/MaterialRegistry.json')
const { ethers } = require('ethers')
const privateKey = process.env.PRIVATE_KEY
const provider = new ethers.providers.JsonRpcProvider(
  process.env.ALCHEMY_SEPOLIA_URL
)
const wallet = new ethers.Wallet(privateKey, provider)
const contract = new ethers.Contract(materialContractAddress, abi.abi, wallet)

const upload = multer({ storage: multer.memoryStorage() })

const uploadDir = path.join(__dirname, '..', 'uploads', 'materialImages')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const hashingFunction = (File) => {
  return crypto.createHash('sha256').update(File).digest('hex')
}
const imageDir = path.join(__dirname, '..', 'src', 'assets', 'SystemImages')

//call to add new material
router.post(
  '/addMaterial/:userId',
  upload.fields([
    { name: 'materialFile', maxCount: 1 },
    { name: 'materialImage', maxCount: 1 },
  ]),

  async (req, res) => {
    const { userId } = req.params
    const file = req.files.materialFile ? req.files.materialFile[0] : undefined
    const image =
      req.files.materialImage && req.files.materialImage.length > 0
        ? req.files.materialImage[0].buffer
        : null

    const {
      materialFile,
      materialTitle,
      materialDescription,
      contributors,
      materialType,
      targetAudience,
      disciplines,
      materialImage,
      technicalType,
      materialAccessibility,
      authorPermission,
      dateUploaded,
      averageRatings,
      totalComments,
      totalReads,
    } = req.body

    try {
      const user = await UserProfile.findOne({ userId: userId })

      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }
      const compressedData = zlib.gzipSync(file.buffer)
      const hashedData = hashingFunction(compressedData)
      let validContributors = []
      let collabRequestContributors = []

      if (contributors && contributors.length > 0) {
        for (const contributor of contributors) {
          if (mongoose.Types.ObjectId.isValid(contributor)) {
            collabRequestContributors.push(contributor)
          } else {
            validContributors.push(contributor)
          }
        }
      }

      let imageBuffer = null
      if (!req.files.materialImage || req.files.materialImage.length === 0) {
        const images = fs.readdirSync(imageDir)
        if (images.length > 0) {
          const randomImage = images[Math.floor(Math.random() * images.length)]
          const randomImagePath = path.join(imageDir, randomImage)

          try {
            const randomImageBuffer = fs.readFileSync(randomImagePath) // Read image file

            imageBuffer = await sharp(randomImageBuffer)
              .resize({ width: 300, height: 300, fit: 'cover' })
              .toBuffer()
          } catch (error) {
            console.error('Error processing random image:', error)
            imageBuffer = null // Handle errors gracefully
          }
        } else {
          imageBuffer = null
        }
      } else {
        imageBuffer = await sharp(image)
          .resize({ width: 300, height: 300, fit: 'cover' })
          .toBuffer()
      }

      const newMaterial = Materials({
        materialFile: compressedData,
        fileHash: hashedData,
        materialTitle,
        materialDescription,
        primaryAuthor: userId,
        contributors: validContributors,
        materialType,
        targetAudience,
        disciplines,
        materialImage: imageBuffer,
        technicalType,
        materialAccessibility,
        authorPermission,
        dateUploaded: dateUploaded || Date.now(),
        averageRatings,
        totalComments,
        totalReads,
      })

      const savedMaterial = await newMaterial.save()

      console.log('Saved material:', savedMaterial)

      if (collabRequestContributors.length > 0) {
        console.log('Creating Collaboration Requests...')
        const newCollabRequest = new collaborationsRequestSchema({
          materialId: savedMaterial._id,
          requestedBy: userId,
          requestedTo: collabRequestContributors.map((id) => ({
            authorId: id,
            authorAction: 'pending',
          })),
          dateRequested: Date.now(),
        })

        const savedRequest = await newCollabRequest.save()

        const pendingRequests = collabRequestContributors.map(
          (contributorId) => ({
            collabRequest_ID: savedRequest._id,
            requestedTo: contributorId,
            userAction: 'pending',
          })
        )

        await pendingCollabRequest.insertMany(pendingRequests)

        return res.status(201).json({
          message:
            'Material added successfully, and collaboration requests sent!',
          material: savedMaterial,
          collabRequest: savedRequest,
          pendingRequests,
        })
      }

      res.status(201).json({
        message: 'Material added successfully!',
        material: savedMaterial,
      })
    } catch (error) {
      console.error('Error saving material:', error)
      res.status(500).json({ error: 'Could not save the material' })
    }
  }
)

//get material data for display including rating and comments
router.get('/getMaterialData/:materialId', async (req, res) => {
  const { materialId } = req.params
  try {
    const material = await Materials.findById(materialId)
      .populate('primaryAuthor')
      .populate('contributors')
    if (!material) {
      return res.status(404).json({ message: 'Material not found' })
    }
    const materialComments = await Comments.find({
      materialId: materialId,
    }).populate('userId')

    console.log({
      material,
      materialComments: materialComments.length
        ? materialComments
        : 'No comments available',
    })
    res.status(200).json({
      material,
      materialComments: materialComments.length
        ? materialComments
        : 'No comments available',
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: error.message })
  }
})

//delete material
router.delete('/deleteMaterial/:materialId', async (req, res) => {
  const { materialId } = req.params
  try {
    const material = await Materials.findByIdAndDelete(materialId)
    if (!material) {
      return res.status(404).json({ message: 'Material not found' })
    }
    await Comments.deleteMany({ materialId: materialId })
    await Ratings.deleteMany({ materialId: materialId })
    await collaborationsRequestSchema.deleteMany({ materialId: materialId })
    await MaterialUpdateRequest.deleteMany({ materialId: materialId })
    await ReadingLists.deleteMany({ materialId: materialId })

    //contract
    let tx
    try {
      tx = await contract.deleteMaterial(materialId)
      const receipt = await tx.wait()
      if (receipt.status === 1) {
        console.log('Material deleted from blockchain successfully!')
      } else {
        console.error('Failed to delete material on the blockchain')
      }
    } catch (contractError) {
      console.error('Smart contract error(delete):', contractError)
      return res.status(500).json({
        error: 'Material deleted, but failed to delete in blockchain.',
      })
    }

    res.status(200).json({ message: 'Material deleted successfully' })
  } catch (error) {
    console.error('Error deleting material:', error)
    res.status(500).json({ error: 'Error deleting material' })
  }
})

//call when adding material to readinglist
router.post('/addToReadingList/:userId/:materialId', async (req, res) => {
  const { userId, materialId } = req.params
  try {
    const { dateAccessed, readCount, downloadCount } = req.body

    const existingAccess = await schemaAccessedMaterial.findOne({
      userId: userId,
      materialId: materialId,
    })
    if (existingAccess) {
      return res
        .status(200)
        .json({ message: 'Material already in accessed materials' })
    }

    const newAccessedMaterial = new schemaAccessedMaterial({
      userId: userId,
      materialId: materialId,
      dateAccessed: dateAccessed ? new Date(dateAccessed) : new Date(),
      readCount: readCount || 1,
      downloadCount: downloadCount || 0,
    })
    await newAccessedMaterial.save()
    res.status(201).json({ message: 'Material added to reading list!' })
  } catch (error) {
    res.status(500).json({ error: 'Error sending request' })
    console.error('Error sending request:', error)
  }
})

//call when user reads or download material
router.post(
  '/updateMaterialAccessAction/:userId/:materialId',
  async (req, res) => {
    try {
      const { userId, materialId } = req.params
      const { action } = req.body
      if (!action || (action !== 'read' && action !== 'download')) {
        return res
          .status(400)
          .json({ error: "Invalid action. Use 'read' or 'download'." })
      }

      const accessedMaterial = await schemaAccessedMaterial.findOne({
        userId,
        materialId,
      })

      if (action === 'read') {
        accessedMaterial.readCount += 1
      } else if (action === 'download') {
        accessedMaterial.downloadCount += 1
      }
      await accessedMaterial.save()
      res.status(200).json({
        message: `Material ${action} count updated successfully!`,
        updatedMaterial: accessedMaterial,
      })
    } catch (error) {
      console.error('Error updating material access:', error)
      res.status(500).json({ error: 'Error updating material access' })
    }
  }
)

//call when requesting an update for materials
router.post(
  '/sendMaterialUpdateRequest/:userId/:materialId',
  async (req, res) => {
    const { userId, materialId } = req.params
    const {
      UpdatedMaterialFile,
      UpdatedMaterialTitle,
      UpdatedMaterialDescription,
      UpdatedPrimaryAuthor,
      UpdatedContributors,
      UpdatedMaterialType,
      UpdatedTargetAudience,
      UpdatedDisciplines,
      UpdatedMaterialImage,
      UpdatedMaterialAccessibility,
      UpdatedAuthorPermission,
      UpdatedDateUploaded,
    } = req.body
    try {
      const user = await UserProfile.findOne({ userId: userId })
      if (!user) {
        return res.status(404).json({ error: 'User found' })
      }

      const material = await Materials.findById(materialId)
      if (!material) {
        return res.status(404).json({ error: 'Material not found' })
      }

      const isContributor = material.contributors.some(
        (contributorId) => contributorId.toString() === userId
      )

      const isPrimaryAuthor = material.primaryAuthor.toString() === userId

      if (!isPrimaryAuthor) {
        if (UpdatedContributors || UpdatedAuthorPermission !== undefined) {
          return res.status(403).json({
            error:
              'Only the primary author can update contirbutors and author permission',
          })
        }
      }

      if (isContributor && !material.authorPermission) {
        return res.status(403).json({
          error:
            'Update request not allowed. Primary author has restricted update permissions.',
        })
      }

      const updatedMaterial = new updatedMaterials({
        materialId,
        UpdatedMaterialFile,
        UpdatedMaterialTitle,
        UpdatedMaterialDescription,
        UpdatedPrimaryAuthor,
        UpdatedContributors: [],
        UpdatedMaterialType,
        UpdatedTargetAudience,
        UpdatedDisciplines,
        UpdatedMaterialImage,
        UpdatedMaterialAccessibility,
        UpdatedAuthorPermission,
        UpdatedDateUploaded: UpdatedDateUploaded || Date.now(),
      })

      const updatedMaterialData = await updatedMaterial.save()
      console.log('Saved material:', updatedMaterialData)

      const formattedContributors = (UpdatedContributors || []).map((id) => ({
        authorId: id,
      }))

      if (UpdatedContributors && UpdatedContributors.length > 0) {
        console.log('Creating material update Requests...')
      }

      const newReqData = new MaterialUpdateRequest({
        materialId: updatedMaterial.materialId,
        requestedBy: userId,
        requestedTo: formattedContributors.map((contributor) => ({
          authorId: contributor.authorId,
          authorAction: 'pending',
        })),
        dateRequested: Date.now(),
      })
      const savedRequest = await newReqData.save()

      const pendingRequests = UpdatedContributors.map((contributorId) => ({
        updateRequest_ID: savedRequest._id,
        requestedTo: contributorId,
        userAction: 'pending',
      }))
      await pendingMaterialUpdateReq.insertMany(pendingRequests)

      return res
        .status(201)
        .json({ message: 'Update request sent successfully', savedRequest })
    } catch (error) {
      console.error('Error sending request to update material:', error)
      res
        .status(500)
        .json({ error: 'Error sending request to update material' })
    }
  }
)

//call when modifying update request for materials
router.put(
  '/modifyUpdatedMaterialData/:userId/:materialId',
  async (req, res) => {
    const { userId, materialId } = req.params
    try {
    } catch (error) {}
  }
)

//call when adding author, this will get registered users name and id
router.get('/getSuggestedUsers', async (req, res) => {
  const searchTerm = req.query.search

  try {
    const author = await UserProfile.find({
      $or: [
        { firstName: { $regex: searchTerm, $options: 'i' } },
        { lastName: { $regex: searchTerm, $options: 'i' } },
      ],
    })
      .limit(10)
      .select('userId firstName lastName primaryInstitution')
    console.log('API Response:', author)
    res.json(author)
  } catch (error) {
    console.error('Error fetching authors:', error) // ✅ Now logs errors
    res.status(500).json({ message: 'Error fetching users', error })
  }
})

//add self as author
router.get('/getMyDetails/:userId', async (req, res) => {
  try {
    const { userId } = req.params
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' })
    }

    const user = await RegisteredUsers.findById(userId) // Fetch user from database
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    //console.log('My details:', `${user.firstName} ${user.lastName}`)
    res.json({ fullName: `${user.firstName} ${user.lastName}` }) // Return full name
  } catch (error) {
    console.error('Error fetching user:', error)
    res.status(500).json({ message: 'Server error' })
  }
})

//get available disciplines in DB
router.get('/getAvailableDisciplines', async (req, res) => {
  try {
    const disciplines = await Materials.distinct('disciplines')
    const response = res.status(200).json(disciplines)
  } catch (error) {
    console.error('Error fetching disciplines:', error)
    res.status(500).json({ message: 'Internal Server Error' })
  }
})

router.get('/getFile/:materialId', async (req, res) => {
  try {
    const materialID = req.params.materialId
    const objectId = new mongoose.Types.ObjectId(materialID)
    const material = await Materials.findById(objectId).select(
      'materialFile materialTitle materialImage'
    )
    if (!material) {
      return res.status(404).send('Material not found.')
    }

    // Decompress the file
    const compressedData = Buffer.from(material.materialFile)
    const decompressedData = zlib.gunzipSync(compressedData)

    // Set headers for file download
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${material.materialTitle}.pdf"`
    )
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('X-Material-Image', material.materialImage.toString('base64'))

    res.send(decompressedData)
  } catch (error) {
    console.error('Error downloading material', error)
    res.status(500).send('Error downloading material.')
  }
})

router.get('/getAllMaterials', async (req, res) => {
  try {
    const allMaterials = await Materials.find(
      {},
      '_id materialTitle materialDescription primaryAuthor averageRatings totalReads materialImage materialType materialAccessibility technicalType disciplines'
    )

    const authorIds = allMaterials.map((material) => material.primaryAuthor)
    const authors = await RegisteredUsers.find(
      { _id: { $in: authorIds } },
      'firstName lastName'
    )
    const profiles = await UserProfile.find(
      {
        userId: { $in: authorIds },
      },
      'userId primaryInstitution'
    )

    const authorMap = {}
    authors.forEach((author) => {
      authorMap[author._id] = `${author.firstName} ${author.lastName}`
    })

    const institutionMap = {}
    profiles.forEach((profile) => {
      institutionMap[profile.userId] =
        profile.primaryInstitution || 'Institution not specified'
    })

    const institutions = profiles.map(
      (profile) => profile.primaryInstitution || 'Institution not specified'
    )

    const formattedMaterials = allMaterials.map((material) => ({
      ...material._doc,
      materialImage: material.materialImage
        ? `data:image/png;base64,${material.materialImage.toString('base64')}`
        : null, // Handle cases where image might be null
      primaryAuthor: authorMap[material.primaryAuthor] || 'Unknown Author',
      primaryInstitution:
        institutionMap[material.primaryAuthor] || 'Institution not specified',
    }))

    res.json(formattedMaterials)
  } catch (error) {
    console.error('Error fetching image:', error)
    res.status(500).send('Error fetching image.')
  }
})

router.get('/getMaterialImage/:materialId', async (req, res) => {
  try {
    const materialID = req.params.materialId
    const objectId = new mongoose.Types.ObjectId(materialID)

    const material = await Materials.findById(objectId).select('materialImage')

    if (!material || !material.materialImage) {
      return res.status(404).send('Image not found.')
    }

    console.log('Image from DB:', material.materialImage)

    // Set the content type dynamically
    res.setHeader('Content-Type', 'image/jpeg') // Change to PNG if needed

    res.end(material.materialImage)
  } catch (error) {
    console.error('Error fetching image:', error)
    res.status(500).send('Error fetching image.')
  }
})

router.post('/incrementReads/:materialId', async (req, res) => {
  try {
    const materialId = req.params.materialId

    const updatedTotalReads = await Materials.findByIdAndUpdate(
      materialId,
      { $inc: { totalReads: 1 } },
      { new: true, select: 'totalReads' }
    )
    res.json({
      message: 'Read count incremented',
      totalReads: updatedTotalReads.totalReads,
    })
  } catch (error) {
    console.error('Error incrementing totalReads:', error)
    res.status(500).json({ error: 'Internal Server Error' })
  }
})

module.exports = router
