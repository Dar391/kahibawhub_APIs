const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { ethers } = require('ethers')
require('dotenv').config()

const RegisteredUsers = require('../src/schemas/schemaRegisteredUsers')
const UserProfile = require('../src/schemas/schemaUserProfile')
const { openStateChannel } = require('../services/channelClient')
const hashpassword = (password) => {
  return crypto.createHash('sha256').update(password).digest('hex')
}

function generateWallet() {
  const wallet = ethers.Wallet.createRandom()
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
  }
}

//call to register a new user
//automatically creates userProfile (to be updated when user visits his/her profile)
router.post('/newRegistration', async (req, res) => {
  const { firstName, lastName, email, password } = req.body
  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' })
  }

  const hashedPassword = hashpassword(password)

  try {
    const wallet = generateWallet()
    const newUser = new RegisteredUsers({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      dateRegistered: new Date(),
      walletAddress: wallet.address,
      privateKey: wallet.privateKey,
    })
    const savedUser = await newUser.save()
    console.log('Newly registered user:', savedUser)

    const newUserProfile = new UserProfile({
      userId: savedUser._id,
      firstName,
      lastName,
      email,
      occupation: '',
      primaryInstitution: '',
      userType: '',
      disciplines: [],
      description: '',
      phoneNumber: '',
      personalWebsiteUrl: '',
      province: '',
      cityOrBarangay: '',
      zipCode: '',
      userImage: '',
      fbLink: '',
      twitterLink: '',
      IGLink: '',
      INLink: '',
    })
    await newUserProfile.save()
    res.status(201).json({
      message: 'User registered successfully',
      user: savedUser,
      profile: newUserProfile,
    })
  } catch (error) {
    console.error('Error saving user:', error)
    res.status(500).json({ error: 'Could not save the user' })
  }
})

router.get('/auth/confirm', async (req, res) => {
  const { token, tokenId } = req.query

  if (!token || !tokenId) {
    return res.status(400).json({ error: 'Invalid confirmation link' })
  }

  try {
    // Call MongoDB App Services API to confirm the user
    await axios.post(
      ` https://us-east-1.aws.data.mongodb-api.com/app/triggers-alvihsk/auth/providers/local-userpass/confirm`,
      { token, tokenId }
    )

    res.send('✅ Email successfully confirmed! You can now log in.')
  } catch (error) {
    console.error('Confirmation error:', error.response?.data || error.message)
    res.status(500).json({ error: '❌ Email confirmation failed' })
  }
})

//call to log-in user to system

router.post('/userLogin', async (req, res) => {
  const { email, password } = req.body

  try {
    const user = await RegisteredUsers.findOne({ email })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const hashedInputPassword = hashpassword(password)
    if (user.password !== hashedInputPassword) {
      return res.status(401).json({ error: 'Incorrect password' })
    }

    const token = jwt.sign({ id: user._id }, 'your_secret_key', {
      expiresIn: '1hr',
    })

    const walletAddress = user.walletAddress
    const privateKey = user.privateKey

    console.log('wallet address:', walletAddress)
    console.log('private key :', privateKey)

    const channelId = await openStateChannel(privateKey, walletAddress)
    console.log('State channel opened with channelId:', channelId)
    //req.session.channelId = channelId

    return res.status(200).json({
      message: 'Login successful',
      token,
      userId: user._id,
      stateChannelInitialized: true,
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
