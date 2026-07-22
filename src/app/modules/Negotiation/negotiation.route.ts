import express from "express";
import { auth } from "../../middlewares/auth";
import { NegotiationController } from "./negotiation.controller";

const router = express.Router();

// Get full negotiation details + all offers (for page load / reconnect)
router.get("/:id", auth(), NegotiationController.getNegotiation);

export const NegotiationRoutes = router;
