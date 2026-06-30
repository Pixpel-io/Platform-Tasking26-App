import { z } from "zod";

export const SignupSchema = z.object({
  fullName: z.string().trim().min(2, "Name must be at least 2 characters."),
  email: z.email("Enter a valid email.").trim().toLowerCase(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .regex(/[a-zA-Z]/, "Include at least one letter.")
    .regex(/[0-9]/, "Include at least one number."),
});

export const LoginSchema = z.object({
  email: z.email("Enter a valid email.").trim().toLowerCase(),
  password: z.string().min(1, "Password is required."),
});

export const EmailOnlySchema = z.object({
  email: z.email("Enter a valid email.").trim().toLowerCase(),
});

export const ResetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .regex(/[a-zA-Z]/, "Include at least one letter.")
    .regex(/[0-9]/, "Include at least one number."),
});

const HexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Choose a valid color.");

export const CreateWorkspaceSchema = z.object({
  workspaceName: z
    .string()
    .trim()
    .min(2, "Workspace name must be at least 2 characters."),
  organizationName: z.string().trim().optional(),
  color: HexColor.optional(),
});

export const UpdateWorkspaceSchema = z.object({
  name: z.string().trim().min(2, "Workspace name must be at least 2 characters."),
  color: HexColor,
  companyName: z
    .string()
    .trim()
    .min(2, "Company name must be at least 2 characters.")
    .optional(),
});

export const InviteSchema = z.object({
  email: z.email("Enter a valid email.").trim().toLowerCase(),
  role: z.enum(["admin", "member"]),
});

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: string;
} | undefined;

// zod 4 moved flattening to a free function.
export function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}
