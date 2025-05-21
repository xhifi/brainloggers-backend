# Auth App with RBAC and SQL

## Overview

This application is a robust authentication and authorization system built with Node.js and SQL databases. It features role-based access control (RBAC), email template management, campaign management, and advanced mailing list functionality with complex filtering capabilities.

## Features

- User authentication and authorization with JWT
- Role-based access control (RBAC) system
- Email template management with variable substitution
- Campaign creation and scheduling
- Advanced mailing list management with complex filtering
- Tag-based subscriber segmentation
- File storage using AWS S3
- Email sending via queue system
- Blog post management with markdown support
- Multiple author collaboration on blog posts
- Tagging and organization of blog content
- Comment system with moderation

## Filter Preview API

The system includes a specialized endpoint to preview filter results:

- Test filter criteria before creating mailing lists
- Get just the count of matching subscribers
- Optionally get paginated subscriber data
- Supports all the same filter formats as mailing lists

See the [Filter Preview API Documentation](docs/filter-preview-api.md) for more details.

## Advanced Mailing List Filtering

The system supports a powerful, Notion-like filtering system for mailing lists that allows:

- Complex nested logical conditions (AND/OR/NOT)
- Filtering on both standard fields and custom metadata
- Type-specific operators for strings, numbers, dates, booleans, and arrays
- Tag-based filtering with validation
- Field extraction from JSON metadata

For detailed documentation on the filter syntax, see [Mailing List Filter Reference](docs/mailing-list-filter-reference.md).

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

## Running Tests

The application includes comprehensive unit and integration tests:

1. Run all tests:

   ```
   npm test
   ```

2. Run with coverage report:

   ```
   npm run test:coverage
   ```

3. Run only unit tests:

   ```
   npm run test:unit
   ```

4. Run only integration tests:

   ```
   npm run test:integration
   ```

5. Run mailing list filter tests:

   ```
   ./run-filter-tests.sh
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
