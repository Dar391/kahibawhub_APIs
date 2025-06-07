const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const zlib = require('zlib')
const Materials = require('../src/schemas/schemaMaterials')
const Comments = require('../src/schemas/schemaMaterialComments')
const schemaUserRatings = require('../src/schemas/schemaMaterialRatings')
const Profile = require('../src/schemas/schemaUserProfile')
const ReadingList = require('../src/schemas/schemaReadingLists')
const PdfParse = require('pdf-parse')
const { ethers } = require('ethers')

const provider = new ethers.JsonRpcProvider(process.env.INFURA_SEPOLIA_RPC)
const systemSigner = new ethers.Wallet(process.env.PRIVATE_KEY, provider)
const contractAddress = process.env.MATERIAL_TRANSACTION_CONTRACT_ADDRESS
const contractABI = require('../artifacts/Contracts/contracts/MaterialTransactions.sol/MaterialTransactions.json')
const contract = new ethers.Contract(
  contractAddress,
  contractABI.abi,
  systemSigner
)

function validateAccess(userRole, materialAccessibility) {
  if (!materialAccessibility || !Array.isArray(materialAccessibility)) {
    return true
  }

  return materialAccessibility.includes(userRole)
}

router.get('/checkAccessibility/:materialId/:userId', async (req, res) => {
  try {
    const { materialId, userId } = req.params
    const objectIdRegex = /^[0-9a-fA-F]{24}$/

    const metadata = await Materials.findById(
      materialId,
      'fileHash primaryAuthor materialAccessibility contributors'
    )
    if (!metadata)
      return res.status(404).json({
        message:
          'Material not found. Kindly submit a report regarding this issue.',
      })
    // Verify file hash on-chain matches DB
    const contractData = await contract.getMaterial(materialId)
    if (!contractData || contractData !== metadata.fileHash) {
      return res.status(400).json({
        message:
          'File integrity check failed! This may indicate that the material file has been modified or the stored data is outdated. Please contact support for assistance.',
      })
    }

    if (metadata.primaryAuthor?.toString() == userId) {
      return res.status(200).json({
        message: 'You are the author of this material. You have access.',
        fileHash: contractData,
      })
    }

    if (metadata.contributors && metadata.contributors.includes(userId)) {
      return res.status(200).json({
        message: 'You are a contributor to this material. You have access.',
        fileHash: contractData,
      })
    }

    const userRoleDoc = await Profile.findOne({ userId: userId }, 'userType')
    //user has to set his/her profile before accessing a material. This is a checker, that passes empty role to front end. If empty then front end will pop notification
    if (!userRoleDoc || !userRoleDoc.userType)
      return res.json({
        message:
          'User type not set. Please complete your profile setup to access materials.',
      })

    const userRole = userRoleDoc.userType

    // Check if the user has access to the material
    const materialAccessibility = metadata?.materialAccessibility
    const userAccess = validateAccess(userRole, materialAccessibility)

    if (!userAccess) {
      return res.status(403).json({
        message: 'You do not have access to this material.',
      })
    }

    return res.status(200).json({
      message: 'Accessibility check successful. You can view the material!',
      fileHash: contractData,
    })
  } catch (error) {
    console.error('Error during access check:', error)
    return res.status(500).json({
      message:
        'Unable to load the material at the moment. Please try again shortly.',
    })
  }
})

router.get('/getMaterialDetails/:materialId/:userId?', async (req, res) => {
  try {
    const { materialId, userId } = req.params
    const fileHash = req.query.fileHash
    const objectIdRegex = /^[0-9a-fA-F]{24}$/

    const metadata = await Materials.findById(materialId)
    if (!metadata)
      return res.status(404).json({
        message:
          'Material not found. Kindly submit a report regarding this issue.',
      })

    //checking credibility
    if (!fileHash || fileHash !== metadata.fileHash) {
      return res.status(400).json({
        message:
          'File integrity check failed! This may indicate that the material file has been modified or the stored data is outdated. Please contact support for assistance.',
      })
    }

    const compressedFile = Buffer.from(metadata.materialFile)
    const decompressedData = zlib.gunzipSync(compressedFile)
    const pdfData = await PdfParse(decompressedData)

    const materialData = {
      ...metadata._doc,
      materialImage: metadata.materialImage
        ? `data:image/png;base64,${metadata.materialImage.toString('base64')}`
        : null,
      materialFile: decompressedData
        ? `data:application/pdf;base64,${decompressedData.toString('base64')}`
        : null,
      dateUploaded: new Date(metadata.dateUploaded).toLocaleDateString(
        'en-US',
        {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
        }
      ),
      totalWords: pdfData.text.split(/\s+/).length,
      totalPages: pdfData.numpages,
    }

    // Handle authors (registered and unregistered)
    const authorStrings = [
      ...(typeof materialData?.primaryAuthor === 'string' &&
      !objectIdRegex.test(materialData.primaryAuthor)
        ? [materialData.primaryAuthor]
        : []),
      ...(materialData?.contributors || []).filter(
        (contributor) =>
          typeof contributor === 'string' && !objectIdRegex.test(contributor)
      ),
    ]

    const primary =
      materialData?.primaryAuthor?._id || materialData?.primaryAuthor
    const contributors = (materialData?.contributors || [])
      .map((contributor) => contributor?._id || contributor)
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map(String)

    // Fetch author profiles
    const allUsers = await Profile.find(
      { userId: { $in: [primary, ...contributors] } },
      'firstName lastName userImage primaryInstitution userId'
    )

    const primaryProfile = allUsers.find(
      (user) => user.userId.toString() === primary.toString()
    )

    const contriProfile = allUsers.filter(
      (user) => user.userId.toString() !== primary.toString()
    )

    const formatAuthor = (author) => ({
      name: `${author.firstName} ${author.lastName}`,
      image: author.userImage
        ? `data:image/png;base64,${author.userImage.toString('base64')}`
        : null,
      primaryInstitution: author.primaryInstitution || 'Not specified',
    })

    const combinedAuthors = [
      ...(primaryProfile ? [formatAuthor(primaryProfile)] : []),
      ...contriProfile.map(formatAuthor),
      ...authorStrings.map((name) => ({
        name,
        image: null,
        primaryInstitution: 'Not registered',
      })),
    ]

    // Fetch similar materials
    const similar = await Materials.find(
      {
        disciplines: { $in: materialData.disciplines },
        _id: { $ne: materialData.materialId },
      },
      '_id materialTitle'
    )

    // Fetch all ratings for the material
    const ratings = await schemaUserRatings
      .find({ materialId })
      .populate('userId', 'username')
      .sort({ ratedDate: -1 })

    // Fetch user-specific rating
    const userRating = userId
      ? await schemaUserRatings.findOne({ materialId, userId })
      : null

    console.log('User rating fetched successfully')

    // Fetch comments
    const comments = await Comments.find({ materialId: materialId }).sort({
      createdAt: -1,
    })
    const commentData = await Promise.all(
      comments.map(async (comment) => {
        const userProfile = await Profile.findOne({ userId: comment.userId })
        return {
          ...comment._doc,
          userName: userProfile
            ? `${userProfile.firstName} ${userProfile.lastName}`
            : 'Unknown User',
          userImage: userProfile?.userImage
            ? `data:image/png;base64,${userProfile.userImage.toString(
                'base64'
              )}`
            : null,
          userType: userProfile?.userType || 'User',
        }
      })
    )

    res.status(200).json({
      materialData,
      combinedAuthors,
      similar,
      ratings: ratings.length ? ratings : null,
      userRating: userRating
        ? {
            ratingValue: userRating.ratingValue,
            ratedDate: userRating.ratedDate,
          }
        : null,
      commentData,
    })
  } catch (error) {
    console.error('Error fetching material details:', error)
    return res.status(500).json({
      message:
        'Unable to load the material at the moment. Please try again shortly.',
    })
  }
})

router.post('/incrementTotalRead/:materialID', async (req, res) => {
  const { materialID } = req.params

  try {
    const material = await Materials.findOne({ _id: materialID })

    if (!material) {
      return res.status(404).json({
        message:
          "The material you're trying to access doesn't exist or has been removed.",
      })
    }

    material.totalReads = (material.totalReads || 0) + 1
    await material.save()
  } catch (error) {
    console.error('Error incrementing totalRead:', error)
    res.status(500).json({
      message:
        'Unable to load the material at the moment. Please try again shortly.',
    })
  }
})

router.post('/addReadingList/:userId/:materialId', async (req, res) => {
  const { userId, materialId } = req.params

  try {
    const existingEntry = await ReadingList.findOne({
      userId: userId,
      materialId: materialId,
    })

    if (existingEntry) {
      return res
        .status(400)
        .json({ message: 'Material already in reading list.' })
    }

    const newEntry = new ReadingList({
      userId: userId,
      materialId: materialId,
    })
    await newEntry.save()
    res.status(201).json({ message: 'Material added to reading list.' })
  } catch (error) {
    console.error('Error adding to readinglist:', error)
    res.status(500).json({
      message:
        'Unable to save the material at the moment. Please try again shortly.',
    })
  }
})
module.exports = router
