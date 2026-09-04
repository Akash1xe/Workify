import { randomBytes } from "node:crypto";

export const slugify = (name: string): string => {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "organization";

  return `${base}-${randomBytes(3).toString("hex")}`;
};

