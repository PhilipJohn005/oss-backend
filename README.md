# Devlinkr - Backend 🚀

A powerful backend service for managing open source project cards with intelligent GitHub integration, real-time issue tracking, and AI-powered text embeddings.

## 🌟 Features

- **GitHub Repository Integration** - Automatically fetch repository metadata, statistics, and issues
- **Smart Issue Management** - Real-time synchronization with GitHub issues via webhooks
- **AI-Powered Embeddings** - Generate text embeddings for enhanced search and recommendation capabilities
- **JWT Authentication** - Secure user authentication and authorization
- **Cross-Origin Support** - CORS-enabled for seamless frontend integration
- **Database Management** - Full CRUD operations with Supabase integration
- **Webhook Handling** - Automatic GitHub webhook setup for issue updates

## 🛠️ Tech Stack

- **Runtime**: Node.js with Express.js
- **Database**: Supabase (PostgreSQL)
- **Authentication**: JWT tokens
- **AI/ML**: @xenova/transformers for text embeddings
- **External APIs**: GitHub REST API v3
- **Deployment**: Render
- **Languages**: TypeScript/JavaScript

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- GitHub Personal Access Token
- Supabase account and project
- Environment variables configured

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd oss-backend

# Install dependencies
npm install

# Start development server
npm run dev
```

## 🔧 Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_SESSION_KEY=your_supabase_anon_key

# GitHub Integration
GITHUB_PAT=your_github_personal_access_token

# JWT Security
BACKEND_JWT_SECRET=your_jwt_secret_key

# Webhook Configuration
WEBHOOK_LISTENER_URL=https://your-backend-url.render.com/webhook

# Server Configuration
PORT=4000
```

### Required GitHub Permissions

Your GitHub Personal Access Token needs the following scopes:
- `repo` - Access to repository data
- `admin:repo_hook` - Webhook management
- `read:user` - User profile information

## 📚 API Documentation

### Authentication

All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### Endpoints

#### 🏷️ Cards Management

**POST** `/server/add-card`
- Add a new GitHub repository 
- **Body**: `{ repo_url, product_description, tags }`
- **Auth**: Required
- **Response**: Card creation status and issues count

**GET** `/server/fetch-card`
- Retrieve all available repos
- **Auth**: Not required
- **Response**: Array of all cards

**GET** `/server/fetch-user-cards`
- Get repos created by authenticated user ( created in the sense - submitted in Devlinkr application )
- **Auth**: Required
- **Response**: Array of user's cards

**GET** `/server/fetch-card-des/:id`
- Get detailed repo information with related issues
- **Params**: `id` - Card ID
- **Response**: Card details with issues array

#### 🤖 AI & Embeddings

**POST** `/server/generate-embedding`
- Generate text embeddings for search/recommendation
- **Body**: `{ text: "your text here" }`
- **Response**: Numerical embedding vector

#### 🏥 Health Check

**GET** `/ping`
- Service health check endpoint , used to keep the backend alive in render by uptimerobot cron job
- **Response**: "Pinged" with timestamp

## 🔄 GitHub Integration Flow

1. **Repository Analysis**: Fetches repo metadata, stars, forks, languages
2. **Issue Processing**: Retrieves all open issues and generates embeddings
3. **Webhook Setup**: Automatically configures GitHub webhooks for real-time updates
4. **Data Storage**: Stores all information in Supabase with proper relationships

## 🗄️ Database Schema

### Cards Table
```sql
- id (primary key)
- card_name
- repo_url
- tags
- user_email
- user_name
- product_description
- stars
- forks
- top_language
- open_issues_count
- embedding (vector)
- created_at
```

### Issues Table
```sql
- id (primary key)
- card_id (foreign key)
- title
- description
- embedding (vector)
- link
- tags
- image
- created_at
```

## 🚀 Deployment

This backend is configured for deployment on Render:

1. **Connect Repository**: Link your GitHub repository to Render
2. **Environment Variables**: Configure all required environment variables in Render dashboard
3. **Build Command**: `npm install`
4. **Start Command**: `npm start` or `node index.js`
5. **Health Check**: Uses `/ping` endpoint

- **If you get issues in build in render then add the command - npm ci**
- npm ci stands for clean install. It installs everything listed in package-lock.json so the project at render and your local device will have the exact same versions of dependencies
- It’s faster and more deterministic than npm install because it doesn’t modify package-lock.json.

### Render Configuration
- **Environment**: Node.js
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Health Check Path**: `/ping`

## 📊 Performance Features

- **Batch Processing**: Efficient batch embedding generation for multiple issues
- **Connection Pooling**: Optimized database connections
- **Caching**: Smart caching for embedding model loading
- **Error Handling**: Comprehensive error handling and logging
- **CORS Optimization**: Configured for specific frontend origins

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **CORS Protection**: Whitelist-based origin control
- **Input Validation**: Request payload validation
- **Rate Limiting**: Built-in protection against abuse
- **Environment Variables**: Secure configuration management

## 🐛 Error Handling

The API provides detailed error responses with appropriate HTTP status codes:

- `400` - Bad Request (invalid input)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error (server issues)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

If you encounter any issues or have questions:

1. Check the [Issues]() section
2. Review the API documentation above
3. Ensure all environment variables are properly configured
4. Verify GitHub token permissions

## 🔗 Related Links

- [Frontend Repository](https://github.com/PhilipJohn005/OSS)
- [Live Demo](https://oss-main-website.vercel.app)

---

Built with ❤️ for the open source community
