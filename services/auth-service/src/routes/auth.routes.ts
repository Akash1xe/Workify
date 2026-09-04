import { Router } from "express";
import {
  listSessions,
  login,
  logout,
  logoutAll,
  me,
  refresh,
  register,
  revokeSession
} from "../controllers/auth.controller";
import { requireAuth } from "../middleware/requireAuth";
import { validateBody } from "../middleware/validate";
import { loginSchema, refreshSchema, registerSchema } from "../validators/auth.schemas";

export const authRouter = Router();

authRouter.post("/register", validateBody(registerSchema), register);
authRouter.post("/login", validateBody(loginSchema), login);
authRouter.post("/refresh", validateBody(refreshSchema), refresh);
authRouter.post("/logout", validateBody(refreshSchema), logout);
authRouter.get("/me", requireAuth, me);
authRouter.get("/sessions", requireAuth, listSessions);
authRouter.delete("/sessions/:id", requireAuth, revokeSession);
authRouter.post("/logout-all", requireAuth, logoutAll);

