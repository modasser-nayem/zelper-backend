import { Router } from "express";
import { AuthRoutes } from "../modules/Auth/auth.routes";
import { userRoutes } from "../modules/User/user.route";
import { NotificationsRoutes } from "../modules/Notification/notification.routes";
import { JobRoutes } from "../modules/Job/job.route";

const routers = Router();

const moduleRoutes: { path: string; route: Router }[] = [
  { path: "/auth", route: AuthRoutes },
  { path: "/users", route: userRoutes },
  { path: "/notifications", route: NotificationsRoutes },
  { path: "/jobs", route: JobRoutes },
];

moduleRoutes.forEach((route) => routers.use(route.path, route.route));

export default routers;

