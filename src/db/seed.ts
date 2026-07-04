import prisma from "./prisma";
import { PasswordHelper } from "../helpers/password";
import { UserRole } from "@prisma/client";

async function main() {
  console.log("Seeding data...");

  const seedEmails = [
    "customer1@gmail.com",
    "customer2@gmail.com",
    "helper_rev@gmail.com",
    "helper_ver@gmail.com",
    "helper_rej@gmail.com",
  ];

  await prisma.user.deleteMany({
    where: { email: { in: seedEmails } },
  });

  const hashed = await PasswordHelper.hashedPassword("password123");
  const avatarBase = "https://api.dicebear.com/7.x/adventurer/svg?seed=";

  // Create Customers
  await prisma.user.create({
    data: {
      name: "Customer One",
      email: "customer1@gmail.com",
      password: hashed,
      role: UserRole.USER,
      avatar: `${avatarBase}CustomerOne`,
    },
  });

  await prisma.user.create({
    data: {
      name: "Customer Two",
      email: "customer2@gmail.com",
      password: hashed,
      role: UserRole.USER,
      avatar: `${avatarBase}CustomerTwo`,
    },
  });

  // Create Helper - In Review (directly on User)
  const helperInReview = await prisma.user.create({
    data: {
      name: "Helper In Review",
      email: "helper_rev@gmail.com",
      password: hashed,
      role: UserRole.USER,
      avatar: `${avatarBase}HelperRev`,
      verification_status: "IN_REVIEW",
      expertise: ["Plumbing Services"],
      phone: "+1-305-555-0101",
      bio: "Experienced plumber with 5+ years of service.",
    },
  });

  await prisma.verificationDocument.create({
    data: {
      user_id: helperInReview.id,
      document_type: "JPG",
      document_url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    },
  });

  // Create Helper - Verified (directly on User)
  const helperVerified = await prisma.user.create({
    data: {
      name: "Helper Verified",
      email: "helper_ver@gmail.com",
      password: hashed,
      role: UserRole.USER,
      avatar: `${avatarBase}HelperVer`,
      verification_status: "VERIFIED",
      expertise: ["Electrical Maintenance"],
      phone: "+1-713-555-0202",
      bio: "Licensed electrician. 10+ years experience.",
      rating_average: 4.5,
      total_reviews: 12,
    },
  });

  await prisma.verificationDocument.create({
    data: {
      user_id: helperVerified.id,
      document_type: "JPG",
      document_url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    },
  });

  // Create Helper - Rejected (directly on User)
  const helperRejected = await prisma.user.create({
    data: {
      name: "Helper Rejected",
      email: "helper_rej@gmail.com",
      password: hashed,
      role: UserRole.USER,
      avatar: `${avatarBase}HelperRej`,
      verification_status: "REJECTED",
      rejection_reason:
        "The uploaded identity documents are blurred and unreadable. Please upload clear scans.",
      expertise: ["Carpentry & Woodwork"],
      phone: "+1-214-555-0303",
      bio: "Woodwork specialist.",
    },
  });

  await prisma.verificationDocument.create({
    data: {
      user_id: helperRejected.id,
      document_type: "JPG",
      document_url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    },
  });

  console.log("Seeding completed successfully!");
  console.log("Credentials: password123 for all seeded users");
}

main()
  .catch((e) => {
    console.error("Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
