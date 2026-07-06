import {
  JobPostStatus,
  PaymentStatus,
  ServiceHelperStatus,
  UserRole,
  UserStatus,
  Prisma,
} from "@prisma/client";
import prisma from "../../../db/prisma";
import { PaginationHelper } from "../../../helpers/pagination";

export const DashboardService = {
  // get overview stats and recent activity logs for admin dashboard
  getAdminStats: async () => {
    // 1. User counters
    const [
      totalUsers,
      totalHelpers,
      verifiedHelpers,
      activeUsers,
      suspendedUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: UserRole.USER } }),
      prisma.user.count({
        where: { verification_status: ServiceHelperStatus.VERIFIED },
      }),
      prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      prisma.user.count({ where: { status: UserStatus.SUSPENDED } }),
    ]);

    // 2. Job counters by status
    const [
      totalJobs,
      openJobs,
      assignedJobs,
      inProgressJobs,
      waitingApprovalJobs,
      completedJobs,
      closedJobs,
      disputedJobs,
    ] = await Promise.all([
      prisma.jobPost.count(),
      prisma.jobPost.count({ where: { status: JobPostStatus.OPEN } }),
      prisma.jobPost.count({ where: { status: JobPostStatus.ASSIGNED } }),
      prisma.jobPost.count({ where: { status: JobPostStatus.IN_PROGRESS } }),
      prisma.jobPost.count({
        where: { status: JobPostStatus.WAITING_FOR_APPROVAL },
      }),
      prisma.jobPost.count({ where: { status: JobPostStatus.COMPLETED } }),
      prisma.jobPost.count({ where: { status: JobPostStatus.CLOSED } }),
      prisma.jobPost.count({ where: { status: JobPostStatus.DISPUTED } }),
    ]);

    // 3. Financial overview
    const financialStats = await prisma.payment.groupBy({
      by: ["status"],
      _sum: {
        amount: true,
        platform_fee: true,
        helper_amount: true,
      },
    });

    let totalEscrowHeld = 0;
    let totalCommissionEarned = 0;
    let totalPayoutsReleased = 0;
    let totalTransactionVolume = 0;

    financialStats.forEach((stat) => {
      const sumAmount = stat._sum.amount ?? 0;
      const sumFee = stat._sum.platform_fee ?? 0;
      const sumHelper = stat._sum.helper_amount ?? 0;

      totalTransactionVolume += sumAmount;

      if (stat.status === PaymentStatus.FUNDED) {
        totalEscrowHeld += sumHelper;
      }
      if (stat.status === PaymentStatus.RELEASED) {
        totalPayoutsReleased += sumHelper;
      }
      // commission is collected from funded or released payments
      if (
        stat.status === PaymentStatus.FUNDED ||
        stat.status === PaymentStatus.RELEASED
      ) {
        totalCommissionEarned += sumFee;
      }
    });

    // 4. Recent activities
    const [recentJobs, recentPayments, recentWithdrawals, recentVerifications] =
      await Promise.all([
        prisma.jobPost.findMany({
          orderBy: { created_at: "desc" },
          take: 5,
          select: {
            id: true,
            title: true,
            budget: true,
            status: true,
            created_at: true,
            customer: { select: { id: true, name: true, avatar: true } },
          },
        }),
        prisma.payment.findMany({
          orderBy: { created_at: "desc" },
          take: 5,
          select: {
            id: true,
            job_id: true,
            amount: true,
            platform_fee: true,
            status: true,
            created_at: true,
            customer: { select: { id: true, name: true, avatar: true } },
            helper: { select: { id: true, name: true, avatar: true } },
          },
        }),
        prisma.withdrawal.findMany({
          orderBy: { created_at: "desc" },
          take: 5,
          select: {
            id: true,
            amount: true,
            status: true,
            created_at: true,
            wallet: {
              select: {
                helper: { select: { id: true, name: true, avatar: true } },
              },
            },
          },
        }),
        prisma.user.findMany({
          where: { verification_status: ServiceHelperStatus.IN_REVIEW },
          orderBy: { updated_at: "desc" },
          take: 5,
          select: {
            id: true,
            name: true,
            avatar: true,
            email: true,
            verification_status: true,
            updated_at: true,
          },
        }),
      ]);

    return {
      users: {
        total: totalUsers,
        helpers: totalHelpers,
        verifiedHelpers,
        active: activeUsers,
        suspended: suspendedUsers,
      },
      jobs: {
        total: totalJobs,
        open: openJobs,
        assigned: assignedJobs,
        inProgress: inProgressJobs,
        waitingForApproval: waitingApprovalJobs,
        completed: completedJobs,
        closed: closedJobs,
        disputed: disputedJobs,
      },
      financials: {
        totalVolume: parseFloat(totalTransactionVolume.toFixed(2)),
        escrowHeld: parseFloat(totalEscrowHeld.toFixed(2)),
        commissionEarned: parseFloat(totalCommissionEarned.toFixed(2)),
        payoutsReleased: parseFloat(totalPayoutsReleased.toFixed(2)),
      },
      recentActivity: {
        jobs: recentJobs,
        payments: recentPayments,
        withdrawals: recentWithdrawals.map((w) => ({
          id: w.id,
          amount: w.amount,
          status: w.status,
          created_at: w.created_at,
          helper: w.wallet.helper,
        })),
        verifications: recentVerifications,
      },
    };
  },

  // get monthly revenue and job stats for graphs (last 6 months)
  getAdminCharts: async () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [payments, jobs] = await Promise.all([
      prisma.payment.findMany({
        where: {
          created_at: { gte: sixMonthsAgo },
          status: { in: [PaymentStatus.FUNDED, PaymentStatus.RELEASED] },
        },
        select: {
          amount: true,
          platform_fee: true,
          created_at: true,
        },
      }),
      prisma.jobPost.findMany({
        where: {
          created_at: { gte: sixMonthsAgo },
        },
        select: {
          status: true,
          created_at: true,
        },
      }),
    ]);

    const monthsList: {
      key: string;
      label: string;
      revenue: number;
      volume: number;
      totalJobs: number;
      completedJobs: number;
    }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("default", {
        month: "short",
        year: "numeric",
      });
      monthsList.push({
        key,
        label,
        revenue: 0,
        volume: 0,
        totalJobs: 0,
        completedJobs: 0,
      });
    }

    payments.forEach((p) => {
      const date = new Date(p.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const month = monthsList.find((m) => m.key === key);
      if (month) {
        month.revenue = parseFloat((month.revenue + p.platform_fee).toFixed(2));
        month.volume = parseFloat((month.volume + p.amount).toFixed(2));
      }
    });

    jobs.forEach((j) => {
      const date = new Date(j.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const month = monthsList.find((m) => m.key === key);
      if (month) {
        month.totalJobs += 1;
        if (
          j.status === JobPostStatus.COMPLETED ||
          j.status === JobPostStatus.CLOSED
        ) {
          month.completedJobs += 1;
        }
      }
    });

    return monthsList;
  },

  // list all payments for admin panel with filters and search
  getAdminPayments: async (payload: {
    query: {
      page?: string;
      limit?: string;
      status?: string;
      searchTerm?: string;
    };
  }) => {
    const { query } = payload;
    const { page, limit, skip } = PaginationHelper.calculatePagination({
      page: Number(query.page),
      limit: Number(query.limit),
    });

    const andConditions: Prisma.PaymentWhereInput[] = [];

    if (query.status) {
      andConditions.push({ status: query.status as PaymentStatus });
    }

    if (query.searchTerm) {
      andConditions.push({
        OR: [
          {
            job: { title: { contains: query.searchTerm, mode: "insensitive" } },
          },
          {
            customer: {
              name: { contains: query.searchTerm, mode: "insensitive" },
            },
          },
          {
            helper: {
              name: { contains: query.searchTerm, mode: "insensitive" },
            },
          },
        ],
      });
    }

    const whereConditions =
      andConditions.length > 0 ? { AND: andConditions } : {};

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where: whereConditions,
        include: {
          job: { select: { id: true, title: true, status: true } },
          customer: {
            select: { id: true, name: true, avatar: true, email: true },
          },
          helper: {
            select: { id: true, name: true, avatar: true, email: true },
          },
        },
        orderBy: { created_at: "desc" },
        take: limit,
        skip,
      }),
      prisma.payment.count({ where: whereConditions }),
    ]);

    return {
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      data: payments,
    };
  },

  // list helper wallets
  getAdminWallets: async (payload: {
    query: { page?: string; limit?: string };
  }) => {
    const { query } = payload;
    const { page, limit, skip } = PaginationHelper.calculatePagination({
      page: Number(query.page),
      limit: Number(query.limit),
    });

    const [wallets, total] = await Promise.all([
      prisma.wallet.findMany({
        include: {
          helper: {
            select: {
              id: true,
              name: true,
              avatar: true,
              email: true,
              phone: true,
            },
          },
        },
        orderBy: { available_balance: "desc" },
        take: limit,
        skip,
      }),
      prisma.wallet.count(),
    ]);

    return {
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      data: wallets,
    };
  },
};
