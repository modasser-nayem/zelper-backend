import prisma from "./prisma";
import { PasswordHelper } from "../helpers/password";
import { UserRole } from "@prisma/client";

async function main() {
  console.log("Seeding data...");

  const seedEmails = [
    "customer1@gmail.com",
    "customer2@gmail.com",
    "provider_rev@gmail.com",
    "provider_ver@gmail.com",
    "provider_rej@gmail.com",
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
      role: UserRole.CUSTOMER,
      avatar: `${avatarBase}CustomerOne`,
    },
  });

  await prisma.user.create({
    data: {
      name: "Customer Two",
      email: "customer2@gmail.com",
      password: hashed,
      role: UserRole.CUSTOMER,
      avatar: `${avatarBase}CustomerTwo`,
    },
  });

  // Create Provider - In Review (with ProviderProfile)
  const providerInReview = await prisma.user.create({
    data: {
      name: "Provider In Review",
      email: "provider_rev@gmail.com",
      password: hashed,
      role: UserRole.CUSTOMER,
      avatar: `${avatarBase}ProviderRev`,
    },
  });
  await prisma.providerProfile.create({
    data: {
      user_id: providerInReview.id,
      verification_status: "IN_REVIEW",
      documents: [
        "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      ],
      expertise: "Plumbing Services",
      phone: "+1-305-555-0101",
      bio: "Experienced plumber with 5+ years of service.",
      experience_years: 5,
    },
  });

  // Create Provider - Verified
  const providerVerified = await prisma.user.create({
    data: {
      name: "Provider Verified",
      email: "provider_ver@gmail.com",
      password: hashed,
      role: UserRole.PROVIDER,
      avatar: `${avatarBase}ProviderVer`,
    },
  });
  await prisma.providerProfile.create({
    data: {
      user_id: providerVerified.id,
      verification_status: "VERIFIED",
      documents: ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
      expertise: "Electrical Maintenance",
      phone: "+1-713-555-0202",
      bio: "Licensed electrician. 10+ years experience.",
      experience_years: 10,
      rating_average: 4.5,
      total_reviews: 12,
    },
  });

  // Create Provider - Rejected
  const providerRejected = await prisma.user.create({
    data: {
      name: "Provider Rejected",
      email: "provider_rej@gmail.com",
      password: hashed,
      role: UserRole.CUSTOMER,
      avatar: `${avatarBase}ProviderRej`,
    },
  });
  await prisma.providerProfile.create({
    data: {
      user_id: providerRejected.id,
      verification_status: "REJECTED",
      rejection_reason:
        "The uploaded identity documents are blurred and unreadable. Please upload clear scans.",
      documents: ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
      expertise: "Carpentry & Woodwork",
      phone: "+1-214-555-0303",
      bio: "Woodwork specialist.",
      experience_years: 3,
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
