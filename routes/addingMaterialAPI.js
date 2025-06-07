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
const pendingCollabRequest = require('../src/schemas/schemaPendingCollabRequests')
const collaborationsRequestSchema = require('../src/schemas/schemaCollaborationRequests')
const UserProfile = require('../src/schemas/schemaUserProfile')

const materialContractAddress = process.env.ADD_MATERIAL_CONTRACT_ADDRESS
const abi = require('../artifacts/Contracts/contracts/MaterialRegistry.sol/MaterialRegistry.json')
const { ethers } = require('ethers')
require('dotenv').config()



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
    if (!file) {
      return res
        .status(400)
        .json({ error: 'Material file is missing or incorrectly uploaded. Please try again.' })
    }
  

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
            imageBuffer = null
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
      const materialId = await savedMaterial._id.toString()


      if (collabRequestContributors.length > 0) {
        const newCollabRequest = new collaborationsRequestSchema({
          materialId: materialId,
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
       
        materialID: materialId,
      })
    } catch (error) {
      console.error('Error saving material:', error)
      res.status(500).json({ error: 'Could not save the material. Please try again later.' })
    }
  }
)

module.exports = router
