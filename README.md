# kahibawhub_APIs

Welcome to the **KahibawHub APIs** repository! This project contains the backend API endpoints for the KahibawHub application. These APIs provide the necessary functionality to support the application, including user management, data processing, and other core services.

This API includes various files for handling tasks such as:
- **authAPI.js** file defines the API routes for handling user registration, login, and email confirmation in an Express-based application
- The **materialTransactionsAPI.js** file defines various routes for managing materials in the system, including updating, retrieving, and deleting materials.
- The **addingMaterialAPI.js** allows users to add materials to the system, including uploading material files and images, and processing collaboration requests. It provides functionality to handle file uploads, create new materials, and manage contributors.
- The **browsingAPI.js** provides various endpoints to filter, search, and browse materials within the system. It supports searching for materials, filtering based on different criteria, and retrieving materials from a user's reading list or those uploaded by the user.
- ThecollaborationsAPI.js provides functionalities related to collaborations, including sending collaboration requests, accepting or rejecting requests, and tracking material collaborations. It interacts with different schemas like `Materials`, `UserProfile`, and `CollaborationRequests`.
- The **Engagements API** is responsible for gathering and analyzing user interactions with materials, including ratings, comments, and overall user activity. It provides endpoints for fetching user analytics, material performance, and interaction data.
- The **openMaterialAPI.js** provides functionality to retrieve and interact with materials in the system. Retrieve detailed information about materials, including file data and author profiles. Fetch ratings, comments, and other engagement data for materials.
- The **Ranking API** provides functionality to retrieve and calculate rankings for authors based on their material reads and ratings. It allows fetching of ranked author lists based on engagement data such as total reads and average ratings.
- The **User Interactions API** provides functionality for handling user interactions with materials, including adding comments, ratings, and tracking user engagement. It calculates Bayesian ratings and allows users to interact with materials by adding ratings and comments.
- The **User Profiling API** provides functionality to manage and update user profiles, including personal information, social links, affiliations, and user image uploads. It also handles the addition of secondary affiliations and fetching detailed user information for display or editing.
- The **User Profiling API** provides functionality to manage and update user profiles, including personal information, social links, affiliations, and user image uploads. It also handles the addition of secondary affiliations and fetching detailed user information for display or editing.

  -----------------------------------------------------------------------------------------
Set up environment variables:

Create a .env file in the root directory and add the necessary environment variables for your application.

--------------------------------------------------------------------------------------------
Use Axios for making HTTP requests in a your front end. Before using Axios in your React component, you need to import it. You define an async function to handle the HTTP request. The async keyword allows the use of the await keyword inside the function to wait for asynchronous operations to complete.
----------------------------------------------------------------------------------------------
The server.js exposes multiple RESTful API endpoints to handle authentication, collaboration requests, material transactions, user profiling, engagements, rankings, and more.

-----------------------------------------------------------------------------------------------
Core libraries:
- express
- mongoose
- dotenv
- cors
- multer
- sharp
- zlib
- crypto
- pdf-parse
- axios

Installation:
 git clone https://github.com/Dar391/kahibawhub_APIs.git
cd kahibawhub_APIs
