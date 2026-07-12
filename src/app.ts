import httpStatus from "http-status";
import path from "path";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import routers from "./app/routes";
import { globalErrorHandler } from "./app/middlewares/globalErrorHandler";
import config from "./config";
import logger from "./utils/logger";
import serverFancyUI from "server-fancy-ui";

class App {
  public app: express.Application;

  constructor() {
    this.app = express();
    this.config();
    this.routes();
    this.handleErrors();
  }
  // configure express middlewares

  private config() {
    this.app.use(
      cors({
        origin: [config.FRONTEND_URL, "http://localhost:3032"],
        credentials: true,
        methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization"],
      }),
    );

    // Stripe webhook MUST receive the raw body for signature verification.
    // This MUST be registered before express.json() to avoid body parsing.
    this.app.use(
      "/api/v1/payments/webhook",
      express.raw({ type: "application/json" }),
    );

    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(cookieParser());

    // log hit route
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.url}`);
      next();
    });
  }

  private routes() {
    // home route
    this.app.get("/", serverFancyUI({ ui: "root" }));

    this.app.get("/api/v1/health", (req, res, next) => {
      res.status(200).json({
        message: "Server Health is Ok",
      });
    });

    this.app.use("/api/v1", routers);
  }

  private handleErrors() {
    this.app.use((req, res, next) => {
      res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: "API NOT FOUND!",
        error: {
          path: req.originalUrl,
          message: "Your requested path is not found!",
        },
      });
    });
    this.app.use(globalErrorHandler);
  }
}

export default new App().app;
