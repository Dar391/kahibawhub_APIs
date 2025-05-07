const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const Materials = require('../src/schemas/schemaMaterials')
const Profile = require('../src/schemas/schemaUserProfile')

router.get('/getRanking', async (req, res) => {
  try {
    const allMaterial = await Materials.find(
      {},
      '_id primaryAuthor totalReads averageRatings '
    )

    const authorDataMap = allMaterial.reduce((acc, material) => {
      const authorId = material.primaryAuthor.toString() // Ensure it's a string

      // Initialize data for author if it doesn't exist
      if (!acc[authorId]) {
        acc[authorId] = {
          totalReads: 0,
          ratings: [],
        }
      }

      // Accumulate totalReads
      acc[authorId].totalReads += material.totalReads

      // Push the material's average rating into the author's ratings array
      acc[authorId].ratings.push(material.averageRatings)

      return acc
    }, {})

    // Extract unique author IDs
    const authorIds = Object.keys(authorDataMap)

    // Fetch author profiles
    const authors = await Profile.find(
      { userId: { $in: authorIds } },
      'userId firstName lastName userImage'
    )

    // Format response with total reads and list of ratings per author
    const rankedAuthors = authors.map((author) => {
      const { totalReads, ratings } = authorDataMap[
        author.userId.toString()
      ] || { totalReads: 0, ratings: [] }

      return {
        id: author.userId,
        name: `${author.firstName} ${author.lastName}`,
        totalReads, // Total reads for the author's materials
        ratings, // List of ratings for each material by the author
      }
    })

    // Send the ranking list as a response
    res.status(200).json(rankedAuthors)
  } catch (error) {
    console.error('Error fetching rankings:', error)
    res.status(500).json({ error: 'Could not retrieve rankings' })
  }
})

module.exports = router
