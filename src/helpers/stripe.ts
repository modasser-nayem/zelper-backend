import Stripe from "stripe";
import config from "../config";

let stripeInstance: Stripe | null = null;

export const getStripe = (): Stripe => {
  if (!stripeInstance) {
    if (!config.stripe.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    stripeInstance = new Stripe(config.stripe.STRIPE_SECRET_KEY, {
      apiVersion: "2025-08-27.basil",
    });
  }
  return stripeInstance;
};
