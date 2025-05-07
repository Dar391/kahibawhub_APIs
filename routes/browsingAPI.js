const express = require('express')
const router = express.Router()
const multer = require('multer')

const Materials = require('../src/schemas/schemaMaterials')
const Profile = require('../src/schemas/schemaUserProfile')
const RegisteredUsers = require('../src/schemas/schemaRegisteredUsers')
const ReadingList = require('../src/schemas/schemaReadingLists')

router.get('/getFilterOption', async (req, res) => {
  const { type, userId } = req.query
  if (!type || !userId) {
    return res.status(400).json({ error: 'Missing type or userId' })
  }

  try {
    let institutions = null
    let filterOptions = null

    if (type === 'uploaded') {
      const profile = await Profile.findOne(
        { userId: userId },
        'primaryInstitution'
      )
      institutions = profile?.primaryInstitution
        ? Array.isArray(profile.primaryInstitution)
          ? profile.primaryInstitution
          : [profile.primaryInstitution]
        : []

      filterOptions = await Materials.find(
        { primaryAuthor: userId },
        'materialType disciplines materialAccessibility technicalType'
      )
    }

    if (type === 'readingList') {
      const readingList = await ReadingList.find({ userId: userId })
      console.log('Reading List:', readingList)

      const materialIds = readingList.map((doc) => doc.materialId)
      console.log('Reading List:', materialIds)

      filterOptions = await Materials.find(
        { _id: materialIds },
        'materialType disciplines materialAccessibility technicalType primaryAuthor'
      )

      const authorIds = [
        ...new Set(filterOptions.map((doc) => doc.primaryAuthor)),
      ]
      console.log('Unique Primary Authors:', authorIds)

      institutions = await Profile.find({
        userId: { $in: authorIds },
      }).distinct('primaryInstitution')

      console.log('Institutions:', institutions)
    }

    if (type === 'browse') {
      institutions = await Profile.distinct('primaryInstitution')
      filterOptions = await Materials.find(
        {},
        'materialType disciplines materialAccessibility technicalType'
      )
    }

    const materialTypes = [
      ...new Set(filterOptions.map((item) => item.materialType)),
    ]
    const disciplines = [
      ...new Set(filterOptions.map((item) => item.disciplines).flat()),
    ]
    const materialAccessibility = [
      ...new Set(
        filterOptions.map((item) => item.materialAccessibility).flat()
      ),
    ]
    const technicalTypes = [
      ...new Set(
        filterOptions
          .map((item) => item.technicalType)
          .flat()
          .filter((type) => type)
      ),
    ]

    res.json({
      institutions,
      materialTypes,
      disciplines,
      materialAccessibility,
      technicalTypes,
    })
  } catch (error) {
    console.error('Error fetching Filter:', error)
    res.status(500).send('Error fetching filter panel.')
  }
})

router.get('/searchMaterial', async (req, res) => {
  try {
    const query = req.query.q
    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required" })
    }
    const results = await Materials.find(
      {
        $or: [
          { materialTitle: { $regex: query, $options: 'i' } },
          { primaryAuthor: { $regex: query, $options: 'i' } },
          { contributors: { $regex: query, $options: 'i' } },
        ],
      },
      'materialTitle materialDescription primaryAuthor averageRatings totalReads materialImage'
    )

    const authorIds = results.map((material) => material.primaryAuthor)
    const authors = await RegisteredUsers.find(
      { _id: { $in: authorIds } },
      'firstName lastName'
    )
    const authorMap = {}
    authors.forEach((author) => {
      authorMap[
        author._id.toString()
      ] = `${author.firstName} ${author.lastName}`
    })

    console.log('names:', authorMap)

    const formattedMaterials = results.map((material) => ({
      materialID: material._id, // Renaming _id to materialID
      materialTitle: material.materialTitle,
      materialDescription: material.materialDescription,
      materialImage: material.materialImage
        ? `data:image/png;base64,${material.materialImage.toString('base64')}`
        : null, // Handle null images
      primaryAuthor:
        authorMap[material.primaryAuthor?.toString()] || 'Unknown Author',
      averageRatings: material.averageRatings || 0, // Default to 0 if undefined
      totalReads: material.totalReads || 0, // Default to 0 if undefined
      totalLikes: material.totalLikes || 0, // Default to 0 if undefined
    }))
    res.json(formattedMaterials)
  } catch (error) {
    res.status(500).json({ error: 'Error fetching search results' })
  }
})

router.get('/getAllMaterials', async (req, res) => {
  const { type, userId } = req.query
  try {
    let allMaterials = null
    let totalMaterials = null
    if (type === 'browse') {
      allMaterials = await Materials.find(
        {},
        '_id materialTitle materialDescription primaryAuthor averageRatings totalReads materialImage materialType materialAccessibility technicalType disciplines'
      )
      totalMaterials = await Materials.countDocuments()
    }

    if (type === 'uploaded') {
      allMaterials = await Materials.find(
        { primaryAuthor: userId },
        '_id materialTitle materialDescription primaryAuthor averageRatings totalReads materialImage materialType materialAccessibility technicalType disciplines'
      )
      totalMaterials = await Materials.countDocuments({ primaryAuthor: userId })
    }

    if (type === 'readingList') {
      const readingList = await ReadingList.find({ userId: userId })
      //get date Added
      const materialIds = readingList.map((doc) => doc.materialId)

      const materials = await Materials.find(
        { _id: { $in: materialIds } },
        '_id materialTitle materialDescription primaryAuthor averageRatings totalReads materialImage materialType materialAccessibility technicalType disciplines'
      )
      const totalCount = materials.length
      allMaterials = materials
      totalMaterials = totalCount
    }

    const authorIds = allMaterials.map((material) => material.primaryAuthor)
    const authors = await RegisteredUsers.find(
      { _id: { $in: authorIds } },
      'firstName lastName'
    )
    const profiles = await Profile.find(
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

    const formattedMaterials = allMaterials.map((material) => ({
      ...material._doc,
      materialImage: material.materialImage
        ? `data:image/png;base64,${material.materialImage.toString('base64')}`
        : null, // Handle cases where image might be null
      primaryAuthor: authorMap[material.primaryAuthor] || 'Unknown Author',
      primaryInstitution:
        institutionMap[material.primaryAuthor] || 'Institution not specified',
    }))

    res.json({ formattedMaterials, totalMaterials })
  } catch (error) {
    console.error('Error fetching image:', error)
    res.status(500).send('Error fetching image.')
  }
})

router.get('/searchQuery', async (req, res) => {
  try {
    const query = req.query.q
    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required" })
    }

    // First, search for the authors by their first and last name in the RegisteredUsers (Profile) collection
    const authors = await RegisteredUsers.find(
      {
        $or: [
          { firstName: { $regex: query, $options: 'i' } },
          { lastName: { $regex: query, $options: 'i' } },
        ],
      },
      '_id firstName lastName'
    )

    // Get the authorIds from the search result
    const authorIds = authors.map((author) => author._id)

    // Now search for materials that match the query either in the material title, contributors, or primary author
    const results = await Materials.find(
      {
        $or: [
          { materialTitle: { $regex: query, $options: 'i' } },
          { primaryAuthor: { $in: authorIds } }, // Match primaryAuthor with found authorIds
          { contributors: { $regex: query, $options: 'i' } },
        ],
      },
      'materialTitle materialDescription primaryAuthor averageRatings totalReads materialImage'
    )

    // Create a map of authors' full names
    const authorMap = authors.reduce((acc, author) => {
      acc[author._id.toString()] = `${author.firstName} ${author.lastName}`
      return acc
    }, {})

    // Format the materials to include full author name
    const formattedMaterials = results.map((material) => ({
      materialID: material._id, // Renaming _id to materialID
      materialTitle: material.materialTitle,
      materialDescription: material.materialDescription,
      materialImage: material.materialImage
        ? `data:image/png;base64,${material.materialImage.toString('base64')}`
        : null, // Handle null images
      primaryAuthor:
        authorMap[material.primaryAuthor?.toString()] || 'Unknown Author',
      averageRatings: material.averageRatings || 0, // Default to 0 if undefined
      totalReads: material.totalReads || 0, // Default to 0 if undefined
      totalLikes: material.totalLikes || 0, // Default to 0 if undefined
    }))

    res.json(formattedMaterials)
  } catch (error) {
    console.error('Error fetching search results:', error)
    res.status(500).json({ error: 'Error fetching search results' })
  }
})

module.exports = router
