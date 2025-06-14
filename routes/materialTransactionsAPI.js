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


const upload = multer({ storage: multer.memoryStorage() })

const uploadDir = path.join(__dirname, '..', 'uploads', 'materialImages')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const hashingFunction = (File) => {
  return crypto.createHash('sha256').update(File).digest('hex')
}
const imageDir = path.join(__dirname, '..', 'src', 'assets', 'SystemImages')



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

    await MaterialUpdateRequest.deleteMany({ materialId: materialId })
    await ReadingLists.deleteMany({ materialId: materialId })

    const requests = await collaborationsRequestSchema
      .find({
        materialId: materialId,
      })
      .select('_id')
     

    if (requests.length > 0) {
      const pendingRequestIds = requests.map((request) => request._id)
      await pendingCollabRequest
        .deleteMany({
          collabRequest_ID: { $in: pendingRequestIds },
        })
        .session(session)
      // Step 5: Delete collaboration requests
      await collaborationsRequestSchema
        .deleteMany({ materialId: materialId })
        
    }

    res.status(200).json({ message: 'Material deleted successfully.' })
  } catch (error) {
    console.error('Error deleting material:', error)
    res.status(500).json({ error: 'An Error An error has occured while deleting material. Try again later.
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

    router.get('/checkingUpdateRequestee/:userId/:materialId', async (req, res) => {
  const { userId, materialId } = req.params

  try {
    // Fetch material
    const material = await Materials.findById(materialId)
    if (!material) {
      return res.status(404).json({ error: 'Material not found.' })
    }

    // Compare primary author ID
    const isPrimaryAuthor = material.primaryAuthor.toString() === userId

    return res.status(200).json({
      isPrimaryAuthor,
      message: isPrimaryAuthor
        ? 'User is the primary author.'
        : 'User is not the primary author.',
    })
  } catch (error) {
    console.error('Error checking author status:', error)
    return res.status(500).json({ error: 'Server error occurred.' })
  }
})


router.put(
  '/updateMaterial/:materialId',
  upload.fields([
    { name: 'materialFile', maxCount: 1 },
    { name: 'materialImage', maxCount: 1 },
  ]),
  async (req, res) => {
    const { materialId } = req.params;

    let existingMaterial;
    try {
      existingMaterial = await Materials.findById(materialId);
      if (!existingMaterial) {
        return res.status(404).json({ error: 'Material not found.' });
      }
    } catch (err) {
      return res.status(400).json({ error: 'Invalid material ID.' });
    }

    const file = req.files.materialFile ? req.files.materialFile[0] : null;
    const image =
      req.files.materialImage && req.files.materialImage.length > 0
        ? req.files.materialImage[0].buffer
        : null;

    const {
      materialTitle,
      materialDescription,
      contributors,
      materialType,
      targetAudience,
      disciplines,
      technicalType,
      materialAccessibility,
      authorPermission,
      averageRatings,
      totalComments,
      totalReads,
    } = req.body;

    try {
      let compressedData = existingMaterial.materialFile;
      let hashedData = existingMaterial.fileHash;

      // Handle file update
      if (file) {
        compressedData = zlib.gzipSync(file.buffer);
        hashedData = hashingFunction(compressedData);
      }

      // Handle image
      let imageBuffer = existingMaterial.materialImage;
      if (image) {
        imageBuffer = await sharp(image)
          .resize({ width: 300, height: 300, fit: 'cover' })
          .toBuffer();
      }

      let validContributors = [];
      if (contributors && contributors.length > 0) {
        for (const contributor of contributors) {
          if (!mongoose.Types.ObjectId.isValid(contributor)) continue;
          validContributors.push(contributor);
        }
      }

      // Update material fields
      existingMaterial.materialTitle = materialTitle;
      existingMaterial.materialDescription = materialDescription;
      existingMaterial.contributors = validContributors;
      existingMaterial.materialType = materialType;
      existingMaterial.targetAudience = targetAudience;
      existingMaterial.disciplines = disciplines;
      existingMaterial.technicalType = technicalType;
      existingMaterial.materialAccessibility = materialAccessibility;
      existingMaterial.authorPermission = authorPermission;
      existingMaterial.averageRatings = averageRatings;
      existingMaterial.totalComments = totalComments;
      existingMaterial.totalReads = totalReads;
      existingMaterial.materialFile = compressedData;
      existingMaterial.fileHash = hashedData;
      existingMaterial.materialImage = imageBuffer;

      const updatedMaterial = await existingMaterial.save();

      res.status(200).json({
        message: 'Material updated successfully.',
        material: updatedMaterial,
      });
    } catch (error) {
      console.error('Update failed:', error);
      res.status(500).json({ error: 'Failed to update material.' });
    }
  }
);


    
//call if requestee is contributor
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
