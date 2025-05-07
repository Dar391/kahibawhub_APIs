const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const multer = require('multer')
const sharp = require('sharp')

const fs = require('fs')
const path = require('path')
const SecondaryAffiliations = require('../src/schemas/schemaSecondaryAffiliation')
const UserProfile = require('../src/schemas/schemaUserProfile')
const RegisteredUsers = require('../src/schemas/schemaRegisteredUsers')
const Materials = require('../src/schemas/schemaMaterials')

const upload = multer({ storage: multer.memoryStorage() })

//route for updating user profile
router.put('/updateUserProfile/:userId', async (req, res) => {
  const { userId } = req.params
  const {
    firstName,
    lastName,
    email,
    occupation,
    primaryInstitution,
    userType,
    disciplines,
    description,
    phoneNumber,
    personalWebsiteUrl,
    province,
    cityOrBarangay,
    zipCode,
  } = req.body

  try {
    // Check if the user exists
    const user = await UserProfile.findOne({ userId: userId })
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Update user fields
    user.firstName = firstName || user.firstName
    user.lastName = lastName || user.lastName
    user.email = email || user.email
    user.occupation = occupation || user.occupation
    user.primaryInstitution = primaryInstitution || user.primaryInstitution
    user.userType = userType || user.userType
    user.disciplines = disciplines || user.disciplines
    user.description = description || user.description
    user.phoneNumber = phoneNumber || user.phoneNumber
    user.personalWebsiteUrl = personalWebsiteUrl || user.personalWebsiteUrl
    user.province = province || user.province
    user.cityOrBarangay = cityOrBarangay || user.cityOrBarangay
    user.zipCode = zipCode || user.zipCode

    // Save the updated user data
    await user.save()

    // Send a success response with the updated user data
    res.status(200).json({
      message: 'User updated successfully',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        dateRegistered: user.dateRegistered,
        occupation: user.occupation,
        primaryInstitution: user.primaryInstitution,
        userType: user.userType,
        disciplines: user.disciplines,
        description: user.description,
        phoneNumber: user.phoneNumber,
        personalWebsiteUrl: user.personalWebsiteUrl,
        province: user.province,
        cityOrBarangay: user.cityOrBarangay,
        zipCode: user.zipCode,
      },
    })
    console.log('saved data:', user)
  } catch (error) {
    console.error('Error updating user:', error)
    res.status(500).json({ error: 'Failed to update user data' })
  }
})

//route for updating image field in userprofile table and saving path to local directory
router.post(
  '/upload-image/:userId',
  upload.single('userImage'),
  async (req, res) => {
    const { userId } = req.params
    try {
      const uploadedImageBuffer = req.file.buffer

      console.log('Image from front end:', uploadedImageBuffer)

      const resizedImage = await sharp(uploadedImageBuffer)
        .resize({ width: 300, height: 300, fit: 'cover' }) // Resize to 300x300
        .toBuffer()

      console.log('Resized image:', resizedImage)

      const response = await UserProfile.findOneAndUpdate(
        { userId: userId },
        { userImage: resizedImage },
        { new: true }
      )

      res.json({
        success: true,
        message: 'Image uploaded successfully',
        userImage: resizedImage,
      })
    } catch (error) {
      console.error('Error uploading image:', error)
      res.status(500).json({ error: 'Error uploading image' })
    }
  }
)

//rout for adding work and school affiliation
router.post('/addSecondaryAffiliations/:userId', async (req, res) => {
  const { userId } = req.params
  const { affiliations } = req.body
  try {
    const user = await UserProfile.findOne({ userId: userId })
    if (!user) {
      return res.status(404).json({ error: 'User not found in tblUserProfile' })
    }
    console.log('Found user:', user)

    if (!Array.isArray(affiliations) || affiliations.length === 0) {
      return res
        .status(400)
        .json({ error: 'Affiliations data is required and must be an array' })
    }

    for (const affiliation of affiliations) {
      const { category, affiliationType, organization, yearTo, yearFrom } =
        affiliation
      if (!category || !affiliationType || !organization) {
        return res
          .status(400)
          .json({ error: 'Missing required fields in affiliations' })
      }
    }

    let userAffiliation = await SecondaryAffiliations.findOne({ userId })
    if (!userAffiliation) {
      userAffiliation = new SecondaryAffiliations({ userId, affiliations: [] })
    }

    // Append new affiliations
    userAffiliation.affiliations.push(...affiliations)

    const savedAffiliation = await userAffiliation.save()
    console.log('New affiliation:', savedAffiliation)
    res.status(201).json({
      message: 'Affiliation added successfully',
      savedAffiliation,
    })
  } catch (error) {
    console.error('Error saving user:', error)
    res.status(500).json({ error: 'Could not save the user' })
  }
})

//getting data from DB to display on modal (updating or viewing)
router.get('/getRequiredUserProfile/:userId', async (req, res) => {
  const { userId } = req.params
  try {
    const objectId = new mongoose.Types.ObjectId(userId)
    // const user = await UserProfile.findById(objectId)
    const user = await UserProfile.findOne({ userId: userId })
    if (!user) {
      return res.status(404).json({ error: 'User not found' }) // User not found
    }
    res.status(200).json(user)
  } catch (error) {
    console.error('Error fetching users:', error)
    res.status(500).json({ error: 'Could not retrieve users' })
  }
})

router.post('/addSocials/:userId', async (req, res) => {
  const { userId } = req.params
  const { fbUrl, instagram, twitter, linkedin } = req.body

  try {
    const updateSocials = await UserProfile.findOneAndUpdate(
      { userId: userId },
      {
        $set: {
          fbLink: fbUrl || undefined,
          twitterLink: twitter || undefined,
          IGLink: instagram || undefined,
          INLink: linkedin || undefined,
        },
      }
    )

    res.status(200).json({
      message: 'User social links updated successfully',
      user: updateSocials,
    })
  } catch (error) {}
})

//get user profile to display
router.get('/getUserProfile/:userId', async (req, res) => {
  const { userId } = req.params
  try {
    const user = await UserProfile.findOne({ userId: userId })

    if (!user) {
      return res.status(404).json({ error: 'User not found' }) // User not found
    }
    res.status(200).json(user)
  } catch (error) {
    console.error('Error fetching users:', error)
    res.status(500).json({ error: 'Could not retrieve users' })
  }
})

//get user profile to display
router.get('/getSocialsToModal/:userId', async (req, res) => {
  const { userId } = req.params

  try {
    const objectId = new mongoose.Types.ObjectId(userId)
    const user = await UserProfile.findOne({ userId: objectId })
    res.status(200).json(user)
  } catch (error) {
    console.error('Error fetching users:', error)
    res.status(500).json({ error: 'Could not retrieve users' })
  }
})

router.get('/getAffiliations/:userId', async (req, res) => {
  const { userId } = req.params

  try {
    const objectId = new mongoose.Types.ObjectId(userId)
    const user = await SecondaryAffiliations.findOne({ userId: objectId })
    res.status(200).json(user)
  } catch (error) {
    console.error('Error fetching users:', error)
    res.status(500).json({ error: 'Could not retrieve users' })
  }
})

// Get total materials, contributions, and collaborators
router.get('/getContributionsSummary/:userId', async (req, res) => {
  const { userId } = req.params

  try {
    //  const objectId = new mongoose.Types.ObjectId(userId)
    const totalMaterials = await Materials.countDocuments({
      primaryAuthor: userId,
    })
    const totalContributedMaterials = await Materials.countDocuments({
      contributors: userId,
    })
    const contributedMaterials = await Materials.find({
      contributors: userId,
    }).select('primaryAuthor')

    const uniqueAuthors = new Set(
      contributedMaterials.map((mat) => String(mat.primaryAuthor))
    )

    res.json({
      totalMaterials,
      totalContributedMaterials,
      totalCollaborators: uniqueAuthors.size, // Count of unique authors
    })
  } catch (error) {
    console.error('Error fetching users:', error)
    res.status(500).json({ error: 'Could not retrieve contributions' })
  }
})

module.exports = router
