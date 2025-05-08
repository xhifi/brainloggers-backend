const { z } = require("zod");

const registerSchema = {
  body: z
    .object({
      name: z.string().min(3, "Name is required"),
      email: z
        .string()
        .trim()
        .email("Valid email is required")
        .transform((val) => val.toLowerCase()), // Normalize email
      password: z.string().min(8, "Password must be at least 8 characters long"),
      confirmPassword: z.string(),
    })
    .superRefine((data, ctx) => {
      if (data.password !== data.confirmPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Passwords do not match",
          path: ["confirmPassword"],
        });
      }
    }),
};

const loginSchema = {
  body: z.object({
    email: z
      .string()
      .trim()
      .email("Valid email is required")
      .transform((val) => val.toLowerCase()), // Normalize email
    password: z.string().min(1, "Password is required"),
  }),
};

const verifyEmailSchema = {
  query: z.object({
    token: z.string().trim().uuid("Invalid verification token format"), // Assuming UUID v4 tokens
  }),
};

const forgotPasswordSchema = {
  body: z.object({
    email: z
      .string()
      .trim()
      .email("Valid email is required")
      .transform((val) => val.toLowerCase()), // Normalize email
  }),
};

const resetPasswordSchema = {
  body: z.object({
    token: z.string().trim().min(1, "Password reset token is required"),
    // Optionally add .uuid() if tokens are UUIDs
    password: z.string().min(8, "New password must be at least 8 characters long"),
    // Consider adding password confirmation field:
    // confirmPassword: z.string().min(1, 'Password confirmation is required')
  }),
  // Optionally add refine to check if passwords match
  // .refine(data => data.password === data.confirmPassword, {
  //     message: 'Passwords do not match',
  //     path: ['confirmPassword']
  // })
};

module.exports = {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
