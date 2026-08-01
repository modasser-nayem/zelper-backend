import { Server, Socket } from "socket.io";
import prisma from "../db/prisma";
import { SOCKET_EVENTS } from "./socket.constant";
import logger from "../utils/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Socket.IO room name scoped to a single job's location session */
const locationRoom = (jobId: string) => `location:${jobId}`;

/** Only allow tracking while the job is in the active delivery window */
const ACTIVE_STATUSES = new Set(["ASSIGNED", "IN_PROGRESS", "WAITING_FOR_APPROVAL"]);

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * handleLocationEvents
 *
 * Registers all real-time location-tracking socket events for one connected socket.
 * Location data is 100% ephemeral — nothing is persisted to the database.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  CLIENT → SERVER                                                        │
 * │  location:join    { jobId }                  — join job tracking room   │
 * │  location:leave   { jobId, role }             — leave tracking room     │
 * │  location:update  { jobId, lat, lng, role }   — broadcast my position   │
 * │  location:stop    { jobId, role }             — I stopped sharing       │
 * │                                                                         │
 * │  SERVER → CLIENT                                                        │
 * │  location:joined          { jobId, role }     — room join confirmed     │
 * │  location:partner         { jobId, role, lat, lng, timestamp }          │
 * │  location:partner_stopped { jobId, role }     — partner stopped         │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export const handleLocationEvents = (io: Server, socket: Socket): void => {
  const userId: string = socket.data.userId;

  const emitError = (msg: string) =>
    socket.emit(SOCKET_EVENTS.ERROR, { message: msg });

  // ── 1. JOIN ROOM ──────────────────────────────────────────────────────────
  // Validates: job exists · user is participant · job in active window
  socket.on(
    SOCKET_EVENTS.JOIN_LOCATION_ROOM,
    async (payload: { jobId: string }) => {
      try {
        const { jobId } = payload ?? {};
        if (!jobId) return emitError("jobId is required.");

        const job = await prisma.jobPost.findUnique({
          where: { id: jobId },
          select: {
            status: true,
            customer_id: true,
            selected_application: { select: { helper_id: true } },
          },
        });

        if (!job) return emitError("Job not found.");
        if (!ACTIVE_STATUSES.has(job.status))
          return emitError("Location tracking is only available for active jobs.");

        const isCustomer = job.customer_id === userId;
        const isHelper = job.selected_application?.helper_id === userId;
        if (!isCustomer && !isHelper)
          return emitError("You are not a participant of this job.");

        const role = isCustomer ? "customer" : "helper";
        await socket.join(locationRoom(jobId));
        logger.info(`User ${userId} (${role}) joined location room for job ${jobId}`);

        socket.emit("location:joined", { jobId, role });
      } catch (err) {
        logger.error("JOIN_LOCATION_ROOM error:", err);
      }
    },
  );

  // ── 2. BROADCAST POSITION ─────────────────────────────────────────────────
  // Re-validates status on every update so stale sessions drop gracefully
  socket.on(
    SOCKET_EVENTS.LOCATION_UPDATE,
    async (payload: {
      jobId: string;
      lat: number;
      lng: number;
      role: "customer" | "helper";
    }) => {
      try {
        const { jobId, lat, lng, role } = payload ?? {};
        if (!jobId || lat == null || lng == null) return;

        const job = await prisma.jobPost.findUnique({
          where: { id: jobId },
          select: { status: true },
        });
        if (!job || !ACTIVE_STATUSES.has(job.status)) return; // silently drop

        socket.to(locationRoom(jobId)).emit(SOCKET_EVENTS.PARTNER_LOCATION, {
          jobId,
          role,
          lat,
          lng,
          timestamp: Date.now(),
        });
      } catch (err) {
        logger.error("LOCATION_UPDATE error:", err);
      }
    },
  );

  // ── 3. STOP SHARING ───────────────────────────────────────────────────────
  // Tells the partner this user toggled location sharing OFF
  socket.on(
    SOCKET_EVENTS.LOCATION_STOP,
    (payload: { jobId: string; role: "customer" | "helper" }) => {
      const { jobId, role } = payload ?? {};
      if (!jobId) return;
      socket
        .to(locationRoom(jobId))
        .emit(SOCKET_EVENTS.PARTNER_STOPPED, { jobId, role });
    },
  );

  // ── 4. LEAVE ROOM ─────────────────────────────────────────────────────────
  // Notifies partner, then removes this socket from the room
  socket.on(
    SOCKET_EVENTS.LEAVE_LOCATION_ROOM,
    async (payload: { jobId: string; role: "customer" | "helper" }) => {
      const { jobId, role } = payload ?? {};
      if (!jobId) return;

      socket
        .to(locationRoom(jobId))
        .emit(SOCKET_EVENTS.PARTNER_STOPPED, { jobId, role });
      await socket.leave(locationRoom(jobId));
      logger.info(`User ${userId} left location room for job ${jobId}`);
    },
  );
};
