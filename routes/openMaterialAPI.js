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

const accountAddress = process.env.TRANS_MATERIAL_CONTRACT_ADDRESS
const abi = require('../artifacts/Contracts/contracts/MaterialTransactions.sol/MaterialTransactions.json')
const { ethers } = require('ethers')
require('dotenv').config()

const privateKey = process.env.PRIVATE_KEY
const provider = new ethers.providers.JsonRpcProvider(
  process.env.ALCHEMY_SEPOLIA_URL
)
const wallet = new ethers.Wallet(privateKey, provider)
const contract = new ethers.Contract(accountAddress, abi.abi, wallet)

function validateAccess(userRole, materialAccessibility) {
  if (Array.isArray(materialAccessibility)) {
    return materialAccessibility.includes(userRole)
  }

  if (userRole === 'Student' && materialAccessibility?.Student) {
    return true
  }

  if (userRole === 'Faculty' && materialAccessibility?.Faculty) {
    return true
  }

  if (materialAccessibility?.Student && materialAccessibility?.Faculty) {
    return true
  }
  return false
}

router.get('/getMaterialDetails/:materialId/:userId?', async (req, res) => {
  try {
    console.log('Fetching material details...')
    const { materialId, userId } = req.params
    const objectIdRegex = /^[0-9a-fA-F]{24}$/
    console.log('Material id:', materialId)
    console.log('User id:', userId)
    const userRole = await Profile.findOne({ userId: userId }, 'userType')

    if (!userRole) return res.status(404).json({ message: 'User not found' })
    // Fetch material metadata
    const metadata = await Materials.findById(materialId)
    const materialAccessibility = metadata?.materialAccessibility
    if (!metadata)
      return res.status(404).json({ message: 'Material not found' })

    console.log('Initiating state channel...')
    console.log('Material Accessibility:', materialAccessibility)
    console.log('User Role:', userRole.userType)
    const userAccess = validateAccess(userRole.userType, materialAccessibility)
    console.log('User access:', userAccess)

    console.log('Wallet:', wallet)
    console.log('Account Address:', accountAddress)
    const channelId = await openStateChannel(
      wallet,
      accountAddress,
      userRole.userType
    )
    console.log('State channel opened:', channelId)
    if (userAccess) {
      await updateStateChannel(wallet, channelId, {
        materialId,
        userRole: userRole.userType,
        userAccess: true,
      })
    } else {
      await updateStateChannel(wallet, channelId, {
        materialId,
        userRole: userRole.userType,
        userAccess: false,
      })
    }

    console.log('Finalizing state channel...')
    const finalState = { materialId, userAccess: userAccess }
    await closeStateChannel(wallet, channelId, finalState)

    console.log('Waiting Channel to closed...')

    let fileHashFromBlockchain = null
    try {
      fileHashFromBlockchain = await contract.finalizeAccessDecision(
        materialId,
        userAccess
      )
      console.log('File Hash from Blockchain:', fileHashFromBlockchain)
      console.log('Transaction Hash:', fileHashFromBlockchain.hash)
      const receipt = await fileHashFromBlockchain.wait()
      console.log('Transaction mined with status:', receipt.status)

      if (!fileHashFromBlockchain || fileHashFromBlockchain === '') {
        // If no file hash was retrieved, return an error response
        return res
          .status(400)
          .json({ message: 'File hash could not be retrieved from blockchain' })
      }
    } catch (error) {
      console.error('Error fetching file hash from blockchain:', error)
    }

    if (fileHashFromBlockchain !== metadata.fileHash) {
      return res.status(400).json({ message: 'File integrity check failed' })
    }

    console.log('File Hash DB:', metadata.fileHash)
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

    res.json({
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
    res.status(500).json({ message: 'Server error' })
  }
})

router.post('/incrementTotalRead/:materialID', async (req, res) => {
  const { materialID } = req.params

  try {
    const material = await Materials.findOne({ _id: materialID })

    if (!material) {
      return res.status(404).json({ message: 'Material not found' })
    }

    material.totalReads = (material.totalReads || 0) + 1
    await material.save()

    res.status(200).json({
      message: 'Total read incremented',
      totalRead: material.totalReads,
    })
  } catch (error) {
    console.error('Error incrementing totalRead:', error)
    res.status(500).json({ message: 'Internal server error' })
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
        .json({ message: 'Material already in reading list' })
    }

    const newEntry = new ReadingList({
      userId: userId,
      materialId: materialId,
    })
    await newEntry.save()
    res
      .status(201)
      .json({ message: 'Material added to reading list', data: newEntry })
  } catch (error) {
    console.error('Error adding to readinglist:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
})
module.exports = router
