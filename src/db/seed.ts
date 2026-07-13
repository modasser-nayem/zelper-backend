import prisma from "./prisma";
import { PasswordHelper } from "../helpers/password";
import { UserRole, JobPostStatus } from "@prisma/client";

async function main() {
  console.log("Cleaning old seed data...");

  const seedEmails = [
    "customer1@gmail.com",
    "customer2@gmail.com",
    "helper_rev@gmail.com",
    "helper_ver@gmail.com",
    "helper_rej@gmail.com",
  ];

  // Delete old reviews, messages, transactions, applications, jobs, etc. linked to seed users
  const seedUsers = await prisma.user.findMany({
    where: { email: { in: seedEmails } },
    select: { id: true },
  });
  const seedUserIds = seedUsers.map((u) => u.id);

  await prisma.review.deleteMany({
    where: {
      OR: [
        { job: { customer_id: { in: seedUserIds } } },
        { helper_id: { in: seedUserIds } },
      ],
    },
  });

  await prisma.walletTransaction.deleteMany({
    where: { wallet: { helper_id: { in: seedUserIds } } },
  });

  await prisma.withdrawal.deleteMany({
    where: { wallet: { helper_id: { in: seedUserIds } } },
  });

  await prisma.wallet.deleteMany({
    where: { helper_id: { in: seedUserIds } },
  });

  await prisma.payment.deleteMany({
    where: { customer_id: { in: seedUserIds } },
  });

  await prisma.jobApplication.deleteMany({
    where: {
      OR: [
        { job: { customer_id: { in: seedUserIds } } },
        { helper_id: { in: seedUserIds } },
      ],
    },
  });

  await prisma.jobPost.deleteMany({
    where: { customer_id: { in: seedUserIds } },
  });

  await prisma.verificationDocument.deleteMany({
    where: { user_id: { in: seedUserIds } },
  });

  await prisma.user.deleteMany({
    where: { id: { in: seedUserIds } },
  });

  console.log("Creating new seed users...");
  const hashed = await PasswordHelper.hashedPassword("password123");
  const avatarBase = "https://api.dicebear.com/7.x/adventurer/svg?seed=";

  // Create Customers
  const customer1 = await prisma.user.create({
    data: {
      name: "Customer One",
      email: "customer1@gmail.com",
      password: hashed,
      role: UserRole.USER,
      avatar: `${avatarBase}CustomerOne`,
    },
  });

  const customer2 = await prisma.user.create({
    data: {
      name: "Customer Two",
      email: "customer2@gmail.com",
      password: hashed,
      role: UserRole.USER,
      avatar: `${avatarBase}CustomerTwo`,
    },
  });

  // Create Helpers
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

  const helperVerified = await prisma.user.create({
    data: {
      name: "Helper Verified",
      email: "helper_ver@gmail.com",
      password: hashed,
      role: UserRole.USER,
      avatar: `${avatarBase}HelperVer`,
      verification_status: "VERIFIED",
      expertise: ["Electrical Maintenance", "Assembly & Carpentry"],
      phone: "+1-713-555-0202",
      bio: "Licensed electrician. 10+ years experience.",
      rating_average: 4.8,
      total_reviews: 1,
      completed_jobs: 1,
    },
  });

  await prisma.verificationDocument.create({
    data: {
      user_id: helperVerified.id,
      document_type: "JPG",
      document_url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    },
  });

  // Initialize wallet for verified helper
  const helperWallet = await prisma.wallet.create({
    data: {
      helper_id: helperVerified.id,
      available_balance: 72.0, // After completed job 2 earnings
      pending_balance: 0.0,
      stripe_account_id: "acct_mockseed123",
      stripe_onboarding_done: true,
    },
  });

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

  console.log("Creating seed job posts...");

  // 1. OPEN Job Post (Negotiable)
  await prisma.jobPost.create({
    data: {
      customer_id: customer1.id,
      title: "Garden Weeding and Lawn Mowing",
      description: "Need help cleaning up my backyard garden. It is about 200 sq ft. Tools provided.",
      budget: 150.0,
      is_negotiable: true,
      scheduled_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // in 3 days
      latitude: 29.9792,
      longitude: 31.1342,
      address: "Giza Pyramid Complex, Egypt",
      status: "OPEN",
    },
  });

  // 2. CLOSED Job Post (with completed review)
  const jobClosed = await prisma.jobPost.create({
    data: {
      customer_id: customer1.id,
      title: "Fix Leaking Kitchen Sink",
      description: "Pipe under the kitchen sink is leaking. Needs a replacement seal.",
      budget: 80.0,
      is_negotiable: false,
      scheduled_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      latitude: 29.9792,
      longitude: 31.1342,
      address: "Giza Pyramid Complex, Egypt",
      status: "CLOSED",
    },
  });

  const appClosed = await prisma.jobApplication.create({
    data: {
      job_id: jobClosed.id,
      helper_id: helperVerified.id,
      status: "SELECTED",
    },
  });

  await prisma.jobPost.update({
    where: { id: jobClosed.id },
    data: { selected_application_id: appClosed.id },
  });

  // Create payment record for closed job
  const closedPayment = await prisma.payment.create({
    data: {
      job_id: jobClosed.id,
      customer_id: customer1.id,
      helper_id: helperVerified.id,
      amount: 80.0,
      platform_fee: 8.0,
      helper_amount: 72.0,
      status: "RELEASED",
      stripe_payment_intent: "pi_mockclosed123",
    },
  });

  // Log completed job wallet transactions
  await prisma.walletTransaction.create({
    data: {
      wallet_id: helperWallet.id,
      type: "JOB_EARNING",
      amount: 72.0,
      reference_id: closedPayment.id,
      note: "Earnings released for job: Fix Leaking Kitchen Sink",
    },
  });

  // Submit review for closed job
  await prisma.review.create({
    data: {
      job_id: jobClosed.id,
      helper_id: helperVerified.id,
      customer_id: customer1.id,
      rating: 5,
      comment: "Outstanding service! Arrived right on time and fixed the leak in 15 minutes.",
    },
  });

  // 3. ASSIGNED Job Post (Payment Funded, Helper Hired)
  const jobAssigned = await prisma.jobPost.create({
    data: {
      customer_id: customer2.id,
      title: "Mount 55-inch TV on Wall",
      description: "Need to mount a TV on drywall. Have the mount bracket, just need tools and expertise.",
      budget: 120.0,
      is_negotiable: false,
      scheduled_at: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // tomorrow
      latitude: 40.7128,
      longitude: -74.0060,
      address: "Manhattan, New York, NY, USA",
      status: "ASSIGNED",
    },
  });

  const appAssigned = await prisma.jobApplication.create({
    data: {
      job_id: jobAssigned.id,
      helper_id: helperVerified.id,
      status: "SELECTED",
    },
  });

  await prisma.jobPost.update({
    where: { id: jobAssigned.id },
    data: { selected_application_id: appAssigned.id },
  });

  await prisma.payment.create({
    data: {
      job_id: jobAssigned.id,
      customer_id: customer2.id,
      helper_id: helperVerified.id,
      amount: 120.0,
      platform_fee: 12.0,
      helper_amount: 108.0,
      status: "FUNDED",
      stripe_payment_intent: "pi_mockassigned123",
    },
  });

  // Create conversation for assigned job
  await prisma.conversation.create({
    data: {
      job_id: jobAssigned.id,
      customer_id: customer2.id,
      helper_id: helperVerified.id,
      status: "ACTIVE",
    },
  });

  // 4. WAITING_FOR_APPROVAL Job Post (Helper finished, customer approval pending)
  const jobWaiting = await prisma.jobPost.create({
    data: {
      customer_id: customer1.id,
      title: "Assemble IKEA Bookshelf",
      description: "Assemble a standard Billy bookshelf. All parts and manuals included.",
      budget: 50.0,
      is_negotiable: false,
      scheduled_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // yesterday
      latitude: 40.7128,
      longitude: -74.0060,
      address: "Manhattan, New York, NY, USA",
      status: "WAITING_FOR_APPROVAL",
    },
  });

  const appWaiting = await prisma.jobApplication.create({
    data: {
      job_id: jobWaiting.id,
      helper_id: helperVerified.id,
      status: "SELECTED",
    },
  });

  await prisma.jobPost.update({
    where: { id: jobWaiting.id },
    data: { selected_application_id: appWaiting.id },
  });

  await prisma.payment.create({
    data: {
      job_id: jobWaiting.id,
      customer_id: customer1.id,
      helper_id: helperVerified.id,
      amount: 50.0,
      platform_fee: 5.0,
      helper_amount: 45.0,
      status: "FUNDED",
      stripe_payment_intent: "pi_mockwaiting123",
    },
  });

  await prisma.conversation.create({
    data: {
      job_id: jobWaiting.id,
      customer_id: customer1.id,
      helper_id: helperVerified.id,
      status: "ACTIVE",
    },
  });

  console.log("Seeding completed successfully!");
  console.log("Test Credentials:");
  console.log("- Customer: customer1@gmail.com / password123");
  console.log("- Helper (Verified): helper_ver@gmail.com / password123");
  console.log("- Helper (In Review): helper_rev@gmail.com / password123");
}

main()
  .catch((e) => {
    console.error("Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
