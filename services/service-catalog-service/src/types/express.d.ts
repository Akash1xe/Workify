declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; sessionId: string };
      organizationRole?: "OWNER" | "ADMIN" | "ENGINEER" | "VIEWER";
      apiKeyIdentity?: { apiKeyId: string; serviceId: string };
    }
  }
}

export {};

