import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

export const vinSchema = z.object({
  vin: z.string().trim().min(11).max(17),
});

export const imageUrlsSchema = z.object({
  imageUrls: z.array(z.string().url()).min(1).max(10),
});

const vehicleSchema = z.object({
  vin: z.string().max(17).optional(),
  year: z.string().max(10).optional(),
  make: z.string().max(64).optional(),
  model: z.string().max(64).optional(),
  engine: z.string().max(64).optional(),
  mileageIn: z.string().max(16).optional(),
  mileageOut: z.string().max(16).optional(),
});

const imageAttachmentSchema = z.object({
  id: z.string().max(64),
  url: z.string().url(),
  name: z.string().max(255),
});

const extractedDataSchema = z.object({
  codes: z.array(z.string()).optional(),
  guidedTests: z.array(z.string()).optional(),
  measurements: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  components: z.array(z.string()).optional(),
  circuits: z.array(z.string()).optional(),
});

const repairLineSchema = z.object({
  id: z.string().optional(),
  lineNumber: z.number().int().positive().optional(),
  description: z.string().max(500).optional(),
  customerConcern: z.string().max(2000).optional(),
  technicianNotes: z.string().max(10000).optional(),
  xentryImages: z.array(imageAttachmentSchema).max(20).optional(),
  xentryOcrTexts: z.array(z.string().max(50000)).max(20).optional(),
  extractedData: extractedDataSchema.optional(),
  warrantyStory: z.string().max(5000).optional(),
});

export const createRepairOrderSchema = z.object({
  fromExtraction: z.boolean().optional(),
  roNumber: z.string().max(32).optional(),
  vehicle: vehicleSchema.optional(),
  customer: z.object({ name: z.string().max(200).optional() }).optional(),
  customerName: z.string().max(200).optional(),
  complaints: z.array(z.string().max(2000)).max(20).optional(),
  xentryImages: z.array(imageAttachmentSchema).max(20).optional(),
  xentryOcrTexts: z.array(z.string().max(50000)).max(20).optional(),
  repairLines: z.array(repairLineSchema).max(50).optional(),
});

export const updateRepairOrderSchema = z.object({
  roNumber: z.string().max(32).optional(),
  vehicle: vehicleSchema.optional(),
  customer: z.object({ name: z.string().max(200).optional() }).optional(),
  complaints: z.array(z.string().max(2000)).max(20).optional(),
  xentryImages: z.array(imageAttachmentSchema).max(20).optional(),
  xentryOcrTexts: z.array(z.string().max(50000)).max(20).optional(),
  repairLines: z.array(repairLineSchema).max(50).optional(),
});

export const createUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(128),
  role: z.enum(['technician', 'manager']).default('technician'),
});

export const updateUserSchema = z.object({
  isActive: z.boolean(),
});

export const storyEditSchema = z.object({
  warrantyStory: z.string().max(5000),
});

export function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): { data: T } | { error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    return { error: result.error.issues.map((i) => i.message).join('; ') };
  }
  return { data: result.data };
}