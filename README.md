# kahibawhub_APIs

Welcome to the **KahibawHub APIs** repository! This project contains the backend API endpoints for the KahibawHub application. These APIs provide the necessary functionality to support the application, including user management, data processing, and other core services.

This API includes various files for handling tasks such as:
- **authAPI.js** file defines the API routes for handling user registration, login, and email confirmation in an Express-based application
- The **materialTransactionsAPI.js** file defines various routes for managing materials in the system, including updating, retrieving, and deleting materials.
- The **addingMaterialAPI.js** allows users to add materials to the system, including uploading material files and images, and processing collaboration requests. It provides functionality to handle file uploads, create new materials, and manage contributors.
- The **browsingAPI.js** provides various endpoints to filter, search, and browse materials within the system. It supports searching for materials, filtering based on different criteria, and retrieving materials from a user's reading list or those uploaded by the user.
- ThecollaborationsAPI.js provides functionalities related to collaborations, including sending collaboration requests, accepting or rejecting requests, and tracking material collaborations. It interacts with different schemas like `Materials`, `UserProfile`, and `CollaborationRequests`.
- The **Engagements API** is responsible for gathering and analyzing user interactions with materials, including ratings, comments, and overall user activity. It provides endpoints for fetching user analytics, material performance, and interaction data.
- The openMaterialAPI.js provides functionality to retrieve and interact with materials in the system. 
