const { z } = require("zod");

// Schema for creating a new template
const createTemplateSchema = {
  body: z.object({
    name: z.string().min(3, "Template name must be at least 3 characters").max(255),
    description: z.string().optional(),
    category: z.string().optional(),
    mjmlSource: z.string().min(1, "MJML source code is required"),
    templateVariables: z.array(z.string()).optional(),
  }),
};

// Schema for updating a template
const updateTemplateSchema = {
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
  body: z
    .object({
      name: z.string().min(3).max(255).optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      mjmlSource: z.string().optional(),
      templateVariables: z.array(z.string()).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
};

// Schema for deleting a template
const deleteTemplateSchema = {
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
};

// Schema for getting a template
const getTemplateSchema = {
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
};

// Schema for listing templates
const listTemplatesSchema = {
  query: z
    .object({
      page: z.coerce.number().int().positive().optional().default(1),
      limit: z.coerce.number().int().positive().optional().default(10),
      category: z.string().optional(),
      search: z.string().optional(),
      isActive: z.coerce.boolean().optional(),
    })
    .optional(),
};

// Schema for image upload
const uploadImageSchema = {
  // Validation will be handled by multer middleware
};

module.exports = {
  createTemplateSchema,
  updateTemplateSchema,
  deleteTemplateSchema,
  getTemplateSchema,
  listTemplatesSchema,
  uploadImageSchema,
};
