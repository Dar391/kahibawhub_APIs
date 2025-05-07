const express = require('express')
const router = express.Router()

const schemaUserComments = require('../src/schemas/schemaMaterialComments')
const schemaUserRatings = require('../src/schemas/schemaMaterialRatings')
const schemaMaterials = require('../src/schemas/schemaMaterials')

const calculateBayesianRating = async (materialId) => {
  const c = 5
  const m = 3

  const ratings = await schemaUserRatings.find({ materialId })
  const n = ratings.length

  if (n === 0) return m
  const sumRatings = ratings.reduce(
    (acc, rating) => acc + rating.ratingValue,
    0
  )
  const bayesianAverage = (c * m + sumRatings) / (c + n)
  return parseFloat(bayesianAverage.toFixed(2))
}

//call to add comment
router.post('/userComments/:materialId', async (req, res) => {
  const { materialId } = req.params
  try {
    const { userId, commentData, commentDate } = req.body
    if (!userId || !commentData) {
      return res
        .status(400)
        .json({ error: 'Required fields are missing or malformed' })
    }

    const newComment = new schemaUserComments({
      userId,
      materialId: materialId,
      commentData,
      commentDate: commentDate || Date.now(),
    })
    await newComment.save()

    const totalComments = await schemaUserComments.countDocuments({
      materialId,
    })
    await schemaMaterials.findByIdAndUpdate(materialId, { totalComments })
    res.status(201).json({ message: 'Comment added!' })
  } catch (error) {
    res.status(500).json({ error: 'Error adding comments' })
    console.error('Error adding comments:', error)
  }
})

//call to add material rating
router.post('/newUserRatings/:materialId', async (req, res) => {
  const { materialId } = req.params
  const { userId, ratingValue, ratedDate } = req.body
  try {
    const { userId, ratingValue, ratedDate } = req.body
    if (!userId || ratingValue === undefined) {
      return res
        .status(400)
        .json({ error: 'Required fields are missing or malformed' })
    }

    const existingRating = await schemaUserRatings.findOne({
      userId,
      materialId,
    })

    if (existingRating) {
      // Update existing rating
      existingRating.ratingValue = Number(ratingValue)
      existingRating.ratedDate = ratedDate || Date.now()
      await existingRating.save()
    } else {
      // Add new rating
      const newRating = new schemaUserRatings({
        userId,
        materialId,
        ratingValue: Number(ratingValue),
        ratedDate: ratedDate || Date.now(),
      })
      await newRating.save()
    }
    const currentAverageRating = await calculateBayesianRating(materialId)
    await schemaMaterials.findByIdAndUpdate(materialId, {
      averageRatings: currentAverageRating,
    })

    res.status(201).json({ message: 'Rating added!', currentAverageRating })
  } catch (error) {
    res.status(500).json({ error: 'Error adding rating!' })
    console.error('Error adding rating:', error)
  }
})

router.get('/getMaterialratings/:materialId', async (req, res) => {
  try {
    const { materialId } = req.params

    // Fetch ratings where materialId matches
    const ratings = await schemaUserRatings
      .find({ materialId })
      .populate('userId', 'username')
      .sort({ ratedDate: -1 })

    // Return null if no ratings are found
    if (!ratings.length) {
      return res.status(200).json(null)
    }

    res.status(200).json(ratings)
  } catch (error) {
    console.error('Error fetching ratings:', error)
    res.status(500).json({ error: 'Error retrieving ratings' })
  }
})

router.get(
  '/getUserRatingPerMaterial/:materialId/:userId',
  async (req, res) => {
    const { materialId, userId } = req.params

    try {
      const userRating = await schemaUserRatings.findOne({ materialId, userId })

      if (!userRating) {
        return res.status(200).json({ ratingValue: null, ratedDate: null })
      }

      res.status(200).json({
        ratingValue: userRating.ratingValue,
        ratedDate: userRating.ratedDate,
      })
    } catch (error) {
      res.status(500).json({ error: 'Error fetching user rating!' })
      console.error('Error fetching user rating:', error)
    }
  }
)

//to be implemented: update rating

module.exports = router
