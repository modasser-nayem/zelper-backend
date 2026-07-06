import { Router } from "express";
import { AuthRoutes } from "../modules/Auth/auth.routes";
import { userRoutes } from "../modules/User/user.route";
import { NotificationsRoutes } from "../modules/Notification/notification.routes";
import { JobRoutes } from "../modules/Job/job.route";
import { NegotiationRoutes } from "../modules/Negotiation/negotiation.route";
import { PaymentRoutes } from "../modules/Payment/payment.route";
import { WalletRoutes } from "../modules/Wallet/wallet.route";

const routers = Router();

const moduleRoutes: { path: string; route: Router }[] = [
  { path: "/auth", route: AuthRoutes },
  { path: "/users", route: userRoutes },
  { path: "/notifications", route: NotificationsRoutes },
  { path: "/jobs", route: JobRoutes },
  { path: "/negotiations", route: NegotiationRoutes },
  { path: "/payments", route: PaymentRoutes },
  { path: "/wallet", route: WalletRoutes },
];

moduleRoutes.forEach((route) => routers.use(route.path, route.route));

export default routers;

