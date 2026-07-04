import express from "express";
import { auth } from "../../middlewares/auth";
import requestValidate from "../../middlewares/validateRequest";
import { NegotiationController } from "./negotiation.controller";
import { NegotiationValidation } from "./negotiation.validation";

const router = express.Router();

// Customer starts a negotiation session
router.post(
  "/",
  auth(),
  requestValidate(NegotiationValidation.startNegotiation),
  NegotiationController.startNegotiation,
);

// Get full negotiation details + all offers (for page load / reconnect)
router.get("/:id", auth(), NegotiationController.getNegotiation);

export const NegotiationRoutes = router;
