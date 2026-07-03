import z from "zod";

/* -------------------- Common reusable schemas -------------------- */
const urlSchema = z
   .string({ required_error: "url is required" })
   .url("Must be a valid URL");
const emailSchema = z
   .string({ required_error: "Email is required!" })
   .email({ message: "Invalid email address" });
const passwordSchema = z
   .string({ required_error: "Password is required!" })
   .min(6, { message: "Password must be at least 6 characters long" });

const isoDateTimeSchema = z
   .string()
   .refine((val) => !val || !Number.isNaN(Date.parse(val)), {
      message: "Must be a valid ISO datetime string",
   });

const dateOfBirthSchema = z
   .string()
   .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be in YYYY-MM-DD format")
   .refine((val) => {
      const d = new Date(val + "T00:00:00Z");
      return d instanceof Date && !Number.isNaN(d.valueOf());
   }, "Must be a valid calendar date");

const phoneSchema = z
   .string()
   .regex(/^[+]?[\d\s-]{6,20}$/, "Must be a valid phone number")
   .optional();

const latSchema = z.number().min(-90).max(90).optional();
const lonSchema = z.number().min(-180).max(180).optional();

const interestsSchema = z.array(z.string().min(2));
const photosSchema = z
   .array(
      z.union([
         z.string().url("Photo must be a valid URL"),
         z.object({
            url: z.string().url("Photo url must be a valid URL"),
            caption: z.string().optional(),
         }),
      ])
   )
   .default([]);

// Recursive JSON schema
type JSONValue =
   | string
   | number
   | boolean
   | null
   | { [key: string]: JSONValue }
   | JSONValue[];
const jsonSchema: z.ZodType<JSONValue> = z.lazy(() =>
   z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(jsonSchema),
      z.record(jsonSchema),
   ])
);

export {
   urlSchema,
   emailSchema,
   passwordSchema,
   isoDateTimeSchema,
   dateOfBirthSchema,
   phoneSchema,
   latSchema,
   lonSchema,
   interestsSchema,
   photosSchema,
   jsonSchema,
};
