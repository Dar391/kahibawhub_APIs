const express = require('express')
const router = express.Router()

const collaborationsSchema = require('../src/schemas/schemaCollaborations')
const collaborationsRequestSchema = require('../src/schemas/schemaCollaborationRequests')
const materials = require('../src/schemas/schemaMaterials')
const pendingCollabRequest = require('../src/schemas/schemaPendingCollabRequests')
const collabRequest = require('../src/schemas/schemaCollaborationRequests')

//moved to adding materials, will be deleted
router.post('/collaborationRequests', async (req, res) => {
  try {
    const { materialId, requestedBy, requestedTo, dateRequested } = req.body

    if (
      !materialId ||
      !requestedBy ||
      !requestedTo ||
      !Array.isArray(requestedTo)
    ) {
      return res
        .status(400)
        .json({ error: 'Required fields are missing or malformed' })
    }

    const newRequest = new collaborationsRequestSchema({
      materialId,
      requestedBy,
      requestedTo,
      dateRequested: Date.now,
    })
    const savedRequest = await newRequest.save()

    const pendingRequests = requestedTo.map((userId) => ({
      collabRequest_ID: savedRequest._id,
      requestedTo: userId,
      userAction: 'pending',
    }))

    await pendingRequests.insertMany(pendingRequests)

    res.status(201).json({
      message: 'Collaboration request sent!',
      collabRequest: savedRequest,
      pendingRequests,
    })
  } catch (error) {
    res.status(500).json({ error: 'Error sending request' })
    console.error('Error sending request:', error)
  }
})

//accepting requests
router.post('/acceptCollaboration/:requestId/:authorId', async (req, res) => {
  const { requestId, authorId } = req.params

  try {
    const CollabRequest = await collaborationsRequestSchema.findById(requestId)
    if (!CollabRequest) {
      return res.status(404).json({ error: 'Collaboration request not found' })
    }

    const pendingRequest = await pendingCollabRequest.findOne({
      collabRequest_ID: requestId,
    })
    if (!pendingRequest) {
      return res.status(404).json({ error: 'Pending collaboration not found' })
    }

    const authorIndex = CollabRequest.requestedTo.findIndex(
      (entry) => entry.authorId.toString() === authorId
    )

    if (authorIndex === -1) {
      return res
        .status(400)
        .json({ error: 'This author was not requested for collaboration' })
    }

    pendingRequest.userAction = 'accepted'
    await pendingRequest.save()
    CollabRequest.requestedTo[authorIndex].authorAction = 'accepted'
    let collab = await collaborationsSchema.findOne({
      materialId: CollabRequest.materialId,
    })

    if (!collab) {
      collab = new collaborationsSchema({
        materialId: CollabRequest.materialId,
        contributors: [{ authorId, dateAccepted: new Date() }],
      })
    } else {
      const existingAuthor = collab.contributors.find(
        (contributor) => contributor.authorId.toString() === authorId
      )

      if (!existingAuthor) {
        // Only add the author if they haven't accepted yet
        collab.contributors.push({ authorId, dateAccepted: new Date() })
      }
    }

    await collab.save()

    //here we add contributors to tblmaterial
    const material = await materials.findById(CollabRequest.materialId)
    if (material) {
      if (!material.contributors.includes(authorId)) {
        material.contributors.push(authorId)
        await material.save()
      }
    } else {
      return res.status(404).json({ error: 'Material not found' })
    }

    const allAccepted = CollabRequest.requestedTo.every(
      (entry) => entry.authorAction === 'accepted'
    )
    const anyRejected = CollabRequest.requestedTo.some(
      (entry) => entry.authorAction === 'rejected'
    )

    if (allAccepted) {
      CollabRequest.requestStatus = 'accepted'
    } else if (anyRejected) {
      CollabRequest.requestStatus = 'rejected'
    }
    await CollabRequest.save()
    res.json({ message: 'Collaboration accepted!', collaboration: collab })
  } catch (error) {
    res.status(500).json({ error: 'Error accepting collaboration' })
    console.log('Error accepting collaboration', error)
  }
})

//rejecting request
router.post('/rejectCollaboration/:requestId/:authorId', async (req, res) => {
  const { requestId, authorId } = req.params
  try {
    const request = await collaborationsRequestSchema.findById(requestId)
    if (!request) {
      return res.status(404).json({ error: 'Collaboration request not found' })
    }

    const authorIndex = request.requestedTo.findIndex(
      (entry) => entry.authorId.toString() === authorId
    )

    if (authorIndex === -1) {
      return res
        .status(400)
        .json({ error: 'This author was not requested for collaboration' })
    }
    request.requestedTo[authorIndex].authorAction = 'rejected'

    const allRejected = request.requestedTo.every(
      (entry) => entry.authorAction === 'rejected'
    )

    const anyAccepted = request.requestedTo.some(
      (entry) => entry.authorAction === 'accepted'
    )
    if (allRejected) {
      request.requestStatus = 'rejected'
    } else if (anyAccepted) {
      request.requestStatus = 'pending' // You can adjust this logic based on your needs
    }
    await request.save()
    res.json({ message: 'Collaboration request rejected' })
  } catch (error) {
    res.status(500).json({ error: 'Error rejecting collaboration' })
  }
})

//to be implemented:
//get user requests for collaboration with other authors (requestor) - display
//get collaboration requests for approval/reject (as requestee) - display
//delete requestor's request for collaboration
//update requestor's request for collaboration

//Note: adding request is in materialTransactionsAPI. Logic: new material added = new request (if there are contributors)

module.exports = router
