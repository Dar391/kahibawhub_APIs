const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')

const Materials = require('../src/schemas/schemaMaterials')
const ReadingList = require('../src/schemas/schemaReadingLists')
const Rating = require('../src/schemas/schemaMaterialRatings')
const Comment = require('../src/schemas/schemaMaterialComments')
const Profile = require('../src/schemas/schemaUserProfile')

const generateAggregationPipelines = (dateField, timeUnit, userId) => {
  let dateFormat

  switch (timeUnit) {
    case 'daily': // <-- Add daily support
      dateFormat = {
        $dateToString: { format: '%Y-%m-%d', date: `$${dateField}` },
      }
      break
    case 'weekly':
      dateFormat = {
        year: { $year: `$${dateField}` },
        month: { $month: `$${dateField}` },
        week: { $ceil: { $divide: [{ $dayOfMonth: `$${dateField}` }, 7] } },
      }
      break
    case 'monthly':
      dateFormat = { $dateToString: { format: '%Y-%m', date: `$${dateField}` } }
      break
    case 'yearly':
      dateFormat = { $dateToString: { format: '%Y', date: `$${dateField}` } }
      break
    default:
      throw new Error('Invalid time unit')
  }

  return [
    {
      $lookup: {
        from: 'tblmaterials',
        localField: 'materialId',
        foreignField: '_id',
        as: 'material',
      },
    },
    { $unwind: '$material' },
    {
      $match: {
        'material.primaryAuthor': userId,
      },
    },
    {
      $group: {
        _id:
          timeUnit === 'weekly'
            ? {
                year: dateFormat.year,
                month: dateFormat.month,
                week: dateFormat.week,
              }
            : {
                timePeriod: dateFormat,
              },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.week': 1 } },
  ]
}

router.get('/userAnalytics/:userId', async (req, res) => {
  const { userId } = req.params
  const { type } = req.query
  try {
    const materials = await Materials.aggregate([
      {
        $match: {
          $or: [{ primaryAuthor: userId }, { contributors: userId }],
        },
      },
      {
        $project: {
          authorIds: {
            $concatArrays: [
              [
                {
                  $cond: [
                    { $ne: ['$primaryAuthor', userId] },
                    '$primaryAuthor',
                    null,
                  ],
                },
              ],
              {
                $filter: {
                  input: '$contributors',
                  as: 'contributor',
                  cond: { $ne: ['$$contributor', userId] },
                },
              },
            ],
          },
          disciplines: 1,
        },
      },
      { $unwind: '$authorIds' },
      { $match: { authorIds: { $ne: null } } },
      {
        $group: {
          _id: null,
          authorIds: { $addToSet: '$authorIds' },
          totalCollaborations: { $sum: 1 },
          disciplines: { $addToSet: '$disciplines' },
        },
      },
    ])

    if (!materials.length) {
      return res.status(200).json({
        objectIds: [],
        stringIds: [],
        institutions: [],
        totalCollaborations: 0,
        totalInstitutions: 0,
        totalDisciplines: 0,
        disciplines: [],
      })
    }

    const authorIds = materials[0].authorIds
    const objectIds = authorIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id))

    let typeArray = []
    let institutionArray = []

    const stringIds = authorIds.filter(
      (id) => !mongoose.Types.ObjectId.isValid(id)
    )
    const authorProfiles = await Profile.find(
      { userId: { $in: objectIds } },
      'firstName lastName primaryInstitution userType userImage occupation description'
    )

    if (type === 'collaborators') {
      const normalizedType = authorProfiles.map((author) => ({
        userType: author.userType || 'Not specified',
      }))
      const TypeCounts = normalizedType.reduce((acc, author) => {
        const type = author.userType
        acc[type] = (acc[type] || 0) + 1
        return acc
      }, {})

      if (stringIds.length > 0) {
        TypeCounts['No account'] =
          (TypeCounts['No account'] || 0) + stringIds.length
      }

      const typeArray = Object.entries(TypeCounts).map(([type, count]) => ({
        type,
        count,
      }))
      return res.json({ typeArray })
    }

    if (type === 'institution') {
      const normalizedInstitutions = authorProfiles.map((author) => ({
        primaryInstitution:
          author.primaryInstitution && author.primaryInstitution.trim() !== ''
            ? author.primaryInstitution
            : 'Not specified',
      }))

      const institutionCounts = normalizedInstitutions.reduce((acc, author) => {
        const institution = author.primaryInstitution
        acc[institution] = (acc[institution] || 0) + 1
        return acc
      }, {})

      if (stringIds.length > 0) {
        institutionCounts['No account'] =
          (institutionCounts['No account'] || 0) + stringIds.length
      }

      const institutionArray = Object.entries(institutionCounts).map(
        ([institution, count]) => ({
          institution,
          count,
        })
      )
      return res.json({ institutionArray })
    }

    if (type === 'analytics') {
      const uniqueDisciplines = [...new Set(materials[0].disciplines.flat())]

      return res.status(200).json({
        totalCollaborations: materials[0].totalCollaborations,
        totalInstitutions: new Set(
          authorProfiles.map((a) => a.primaryInstitution)
        ).size,
        totalDisciplines: uniqueDisciplines.length,
      })
    }

    if (type === 'contributors') {
      const contributorsData = authorProfiles.map((profile) => ({
        fullname: `${profile.firstName} ${profile.lastName}`,
        occupation: profile.occupation,
        school: profile.primaryInstitution,
        description: profile.description,
        image: profile.userImage,
      }))

      return res.status(200).json(contributorsData)
    }
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Internal Server Error' })
  }
})

router.get('/materialAnalytic/:userId', async (req, res) => {
  const { userId } = req.params
  const { type, timeUnit } = req.query // Get the type and timeUnit from query params

  try {
    if (type === 'overview') {
      // Fetch material analytics summary
      const materials = await Materials.find({ primaryAuthor: userId })

      const totalReads = materials.reduce(
        (sum, material) => sum + (material.totalReads || 0),
        0
      )
      const totalComments = materials.reduce(
        (sum, material) => sum + (material.totalComments || 0),
        0
      )
      const totalMaterials = materials.length

      return res.json({ totalReads, totalComments, totalMaterials })
    } else if (type === 'materialType') {
      // Fetch material type distribution
      const materialTypeCounts = await Materials.aggregate([
        { $match: { primaryAuthor: userId } },
        {
          $group: {
            _id: '$materialType',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ])

      return res.json(materialTypeCounts)
    } else if (type === 'readsPerMaterial') {
      // Fetch total reads per material type
      const materialReads = await Materials.aggregate([
        { $match: { primaryAuthor: userId } },
        {
          $group: {
            _id: '$materialType',
            totalReads: { $sum: '$totalReads' },
          },
        },
        { $sort: { totalReads: -1 } },
      ])

      return res.json(materialReads)
    } else if (type === 'history' && timeUnit) {
      // Fetch material interaction history (reads, comments, ratings)
      const readingListPipeline = generateAggregationPipelines(
        'dateAccessed',
        timeUnit,
        userId
      )
      const commentsPipeline = generateAggregationPipelines(
        'commentDate',
        timeUnit,
        userId
      )
      const ratingsPipeline = generateAggregationPipelines(
        'ratedDate',
        timeUnit,
        userId
      )

      const [readingListHistory, commentsHistory, ratingsHistory] =
        await Promise.all([
          ReadingList.aggregate(readingListPipeline),
          Comment.aggregate(commentsPipeline),
          Rating.aggregate(ratingsPipeline),
        ])

      return res.json({ readingListHistory, commentsHistory, ratingsHistory })
    } else {
      return res.status(400).json({ message: 'Invalid request type' })
    }
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Internal server error' })
  }
})

module.exports = router
