# Auth App with RBAC and SQL

## Overview

This application is a robust authentication and authorization system built with Node.js and SQL databases. It features role-based access control (RBAC), email template management, campaign management, and mailing list functionality.

## Features

- User authentication and authorization with JWT
- Role-based access control (RBAC) system
- Email template management with variable substitution
- Campaign creation and scheduling
- Mailing list management based on tags
- File storage using AWS S3
- Email sending via queue system
- Blog post management with markdown support
- Multiple author collaboration on blog posts
- Tagging and organization of blog content
- Comment system with moderation

## API Documentation

This documentation is generated using JSDoc and provides detailed information about all services, controllers, and utilities available in the application.

## Getting Started

1. Install dependencies:

   ```
   npm install
   ```

2. Configure environment variables (see .env.example)

3. Initialize the database:

   ```
   npm run init-db
   ```

4. Start the application:

   ```
   npm start
   ```

5. Start the worker for background processing:
   ```
   npm run worker
   ```

## Blog System

The application includes a full-featured blog system with the following capabilities:

- **Post Management**: Create, update, publish and delete blog posts with markdown content
- **Collaboration**: Multiple authors can work on any post
- **Content Storage**: Markdown content stored in S3 with metadata in the database for fast retrieval
- **Permissions**:
  - Admins can publish posts
  - Authors and editors can create and edit drafts
  - Regular users can read published posts and comment
- **Comments**: Comment system with approval workflow

For detailed API documentation, see [Blog API Documentation](./docs/blog-api.md).

## Documentation

To generate or update this documentation:

```
npm run docs
```

## License

ISC
