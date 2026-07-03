import { Router } from "express";
import { AuthRoutes } from "../modules/Auth/auth.routes";
import { userRoutes } from "../modules/User/user.route";
import { NotificationsRoutes } from "../modules/Notification/notification.routes";
import { providerProfileRoutes } from "../modules/ProviderProfile/providerProfile.routes";
import { jobPostRoutes } from "../modules/JobPost/jobPost.routes";
import { jobInterestedRoutes } from "../modules/JobInterested/jobInterested.routes";
import { conversationRoutes } from "../modules/Conversation/conversation.routes";
import { offerRoutes } from "../modules/Offer/offer.routes";
import { paymentRoutes } from "../modules/Payment/payment.routes";
import { walletRoutes } from "../modules/Wallet/wallet.routes";
import { reviewRoutes } from "../modules/Review/review.routes";

const routers = Router();

const moduleRoutes: { path: string; route: Router }[] = [
  { path: "/auth", route: AuthRoutes },
  { path: "/users", route: userRoutes },
  { path: "/notifications", route: NotificationsRoutes },
  { path: "/provider-profiles", route: providerProfileRoutes },
  { path: "/jobs", route: jobPostRoutes },
  { path: "/interests", route: jobInterestedRoutes },
  { path: "/conversations", route: conversationRoutes },
  { path: "/offers", route: offerRoutes },
  { path: "/payments", route: paymentRoutes },
  { path: "/wallet", route: walletRoutes },
  { path: "/reviews", route: reviewRoutes },
];

moduleRoutes.forEach((route) => routers.use(route.path, route.route));

export default routers;
